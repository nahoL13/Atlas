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

## SPEC-0005 — Cognitive Core (mínimo) (2026-07-13)

**Descobrimos que...**

A promoção de um contrato para `@atlas/contracts` foi disparada exatamente pelo 2º consumidor (a regra de placement): o `@atlas/cognitive` precisou do `ModelGateway`, então os tipos do gateway (`Role`, `Message`, `GenerateRequest`, `GenerateResult`, `ModelGateway`, `ModelGatewayConfig`, `ProviderName`) subiram a contracts (ADR-0007). Re-exportá-los de `@atlas/model-gateway` (via `export type { ... } from '@atlas/contracts'`) manteve `HttpDeps`/`createModelGateway`/provedores/testes intactos — churn quase nulo e a regra "consumidor depende de contrato, não de implementação" preservada.

Config aninhada (`config.model: ModelGatewayConfig`) exige merge campo-a-campo e um tipo de override próprio: com `exactOptionalPropertyTypes`, `Partial<AtlasConfig>` não serve mais como override (o `model` interno tem campos obrigatórios), então nasceu `AtlasConfigOverride` com `model?: Partial<ModelGatewayConfig>`; o merge faz `{ ...defaults.model, ...override.model }` e monta os overrides condicionalmente (nunca `campo: undefined`), tanto no `loadConfig` quanto no Input Gateway da CLI.

A CLI mapeia o erro de modelo por `AtlasError.code === 'ATLAS_MODEL_GATEWAY'` (não por `instanceof ModelGatewayError`), o que permite mensagem amigável + exit `1` **sem** `apps/cli` importar `@atlas/model-gateway` — o desacoplamento apps→gateway fica intacto (a CLI só conhece `@atlas/core` e `@atlas/contracts`).

O ciclo cognitivo foi honrado de forma colapsada (uma única chamada `generate` com `[{system}, {user}]`), sem saídas estruturadas especulativas (intenção/estratégia/risco) — YAGNI: nenhum consumidor as usa ainda. O teste do orquestrador usa um `gateway` stub e o caminho de erro da CLI usa `fetch` injetado que rejeita (provider `local`) → suíte inteira sem rede.

Verificação manual (`ask ... --provider fake`) precisa de `pnpm --filter @atlas/cli exec tsx src/main.ts ...`: o `rtk proxy tsx ...` falha com `tsx: No such file or directory` porque o `tsx` não está no PATH direto do proxy; pelo `pnpm exec` resolve-se o binário do workspace.

**A arquitetura ajudou porque...**

O módulo já existia no Module Catalog (`Cognitive Core → packages/cognitive`, camada Intelligence): nenhuma decisão de novo módulo, só a primeira implementação. A composição manual (ADR-0004) tornou tudo testável sem mock — `createAtlas(options, { fetch })` injeta o `fetch` até o gateway, e o `provider: 'fake'` dá uma resposta ponta a ponta sem rede nem credenciais.

O Core como único orquestrador/composition root (Regra 11) absorveu todo o wiring (gateway + cognitive) sem vazar implementações para `@atlas/cognitive` (que depende só do contrato) nem para a CLI. Trocar o modelo por trás do `ask` é só configuração — o Cognitive Core não conhece o provedor.

**A arquitetura atrapalhou porque...**

Nada estrutural — a ordem das tasks (refatoração de tipos → package sem consumidor → tornar `config.model`/`cognitive` obrigatórios ajustando o único teste que os constrói à mão → ligar a CLI) manteve a suíte verde a cada passo. O único atrito foi de tooling (invocação do `tsx` via proxy), não dos limites arquiteturais.

**Precisamos mudar...**

TypeScript segue pinado na série 5 (encaminhamento: repetir o probe do TS7 em SPEC futura; despinar quando o typescript-eslint suportar o compilador nativo).

Próximas etapas do ciclo cognitivo (Planejamento, Execução, Observação, Aprendizado) dependem de Planner/Runtime/Memory/Context, inexistentes (encaminhamento: SPECs futuras); o `CognitiveCore` poderá ganhar operações/retornos mais ricos sem quebrar o contrato atual. Persona/tom ("Jarvis") fica com o Persona Service inexistente (encaminhamento: SPEC futura) — o system prompt desta SPEC é neutro.

---

## SPEC-0004 — Model Gateway (2026-07-12)

**Descobrimos que...**

`exactOptionalPropertyTypes: true` impede atribuir `undefined` explicitamente a propriedade opcional: montar `ModelGatewayConfig` no smoke exigiu construção condicional (`if (x !== undefined) config.x = x`) em vez de `{ x: valorTalvezUndefined }`. Padrão a repetir sempre que compor objetos com campos opcionais a partir de fontes `T | undefined` (flags/env).

Injetar `fetch` por parâmetro (`HttpDeps`) permitiu testar os provedores de rede (Ollama/remote) sem tocar a rede, com stubs escritos à mão que capturam URL/headers/body — sem framework de mock, coerente com ADR-0004. A rede real fica só no smoke script.

O ESLint do repo (`@typescript-eslint/no-unused-vars`) **não** ignora o prefixo `_`: um `_config` não usado no provedor `fake` quebrou o lint. O padrão do projeto é zero parâmetros não usados — o `fake` virou `createFakeProvider()` sem parâmetro (e o seletor chama sem argumento). Atenção: `pnpm typecheck`/`pnpm test` passam com var não usada; só `pnpm lint` a pega — rodar os três antes de concluir.

`pnpm --filter <pkg> run <script> -- <flags>` vaza o `--` para o `process.argv` do script, e o `parseArgs` (sem `allowPositionals`) rejeita. A invocação correta para repassar flags é `pnpm --filter <pkg> exec tsx scripts/smoke.ts <flags>` (documentado no README do package).

O probe do TS7 (encaminhamento herdado) falhou de novo em 2026-07-12: com `typescript@7.0.2`, o `@typescript-eslint/typescript-estree@8.63.0` lança `TypeError: Cannot read properties of undefined (reading 'Cjs')` e o ESLint sai com código 2. Revertido para a série 5 com a suíte verde.

**A arquitetura ajudou porque...**

O módulo já existia no Module Catalog (`Model Gateway → packages/model-gateway`): não houve decisão de novo módulo, só a primeira implementação. A regra de placement de contratos (tipos ficam locais até um 2º consumidor) manteve a SPEC isolada — sem tocar `@atlas/contracts`, `@atlas/core` nem `apps/cli`.

Tratar o gateway como adaptador sem estado (Princípio 5) manteve a superfície mínima: uma operação `generate`, três provedores atrás do mesmo contrato, troca por config. Estender para um provedor nativo (ex.: Anthropic Messages) no futuro não quebra consumidores.

**A arquitetura atrapalhou porque...**

Nada estrutural — o único atrito foi de tooling (lint com `_`, `--` do pnpm run, probe do TS7), não dos limites arquiteturais.

**Precisamos mudar...**

TypeScript segue pinado na série 5 (encaminhamento: repetir o probe do TS7 em SPEC futura; despinar quando o typescript-eslint suportar o compilador nativo).

Provedor nativo da Anthropic (API Messages própria) e streaming/tool-use ficaram fora de escopo (encaminhamento: SPECs futuras conforme o Cognitive Core precisar). O slot pago hoje é atendido pelo provedor `remote` OpenAI-compatible.

---

## SPEC-0003 — CLI Foundation (2026-07-12)

**Descobrimos que...**

A rota de execução escolhida no design (Node nativo via _type stripping_) não funciona com a convenção de imports `.js` (NodeNext) do repositório: o Node ≥ 24 não remapeia `.js` → `.ts`, e como todo o repo usa `.js`, nem `@atlas/core` carrega. Adotamos `tsx` (`devDependency`) — registrado no ADR-0005. Lição: uma decisão de execução deve ser verificada empiricamente antes de virar recomendação no brainstorming; a recomendação original ("Node nativo estende o padrão sem-`dist` naturalmente") não considerou a interação `.js`/type-stripping.

O pnpm 11 não lê mais o campo `pnpm` do `package.json`; a aprovação de build de dependências (o `esbuild`, motor do `tsx`) vive em `pnpm-workspace.yaml` (`allowBuilds`). Sem isso, `pnpm install` sai com código 1 (`ERR_PNPM_IGNORED_BUILDS`) e trava a verificação de deps dos scripts do pnpm.

O `@atlas/core` não re-exporta os tipos de `@atlas/contracts`; consumidores (a CLI) declaram `@atlas/contracts` como dependência direta (regra `apps/* → packages/*`). O plano assumira "só `@atlas/core`" e foi corrigido na execução.

`AtlasConfig` tem propriedades `readonly` e `Partial<AtlasConfig>` as preserva — o override de config precisa ser construído num objeto local mutável antes de retornar.

O probe do TS7 (encaminhamento da SPEC-0002) falhou de novo: em 2026-07-12 o typescript-eslint 8.63 continua quebrando com o TS 7.0.2; revertido para a série 5 com a suíte verde. Durante o revert, o executor de comandos ficou temporariamente indisponível e foi destravado com o prefixo `!` (usuário rodou a suíte).

**A arquitetura ajudou porque...**

Gateways como interfaces + composição por parâmetro (ADR-0004) tornaram `run()` testável com o core real e um Output Gateway capturador — sem mocks; a integração apps→core é barata porque `createAtlas` é in-memory.

A validação centralizada no core (`loadConfig`) permitiu ao Input Gateway repassar valores crus e ainda exercitar o caminho de `InvalidConfigError` de ponta a ponta, com código de saída coerente.

Manter as interfaces de Gateway locais em `apps/cli` (não em `@atlas/contracts`) evitou tocar core/contracts e respeitou a regra de placement de contratos (sem 2º consumidor ainda).

**A arquitetura atrapalhou porque...**

Nada estrutural — todo o atrito foi de tooling (execução de TS, pnpm 11, esbuild), não dos limites arquiteturais.

**Precisamos mudar...**

TypeScript segue pinado na série 5 (encaminhamento: repetir o probe do TS7 em SPEC futura; despinar e remover a nota do CLAUDE.md quando o typescript-eslint suportar o compilador nativo).

Distribuição/empacotamento da CLI (bin publicável fora do workspace) continua em aberto (encaminhamento: SPEC futura de distribuição; o shebang `npx tsx` atende só o uso em dev).

---

## SPEC-0002 — Core Bootstrap (2026-07-11)

**Descobrimos que...**

O padrão exports → `./src/index.ts` (sem `dist/`) funcionou sem atrito: Vitest e `tsc` resolvem os packages do workspace direto do fonte, e o dev loop é instantâneo.

O probe do TS7 (encaminhamento da SPEC-0001) falhou novamente: em 2026-07-11 o typescript-eslint 8.63 ainda quebra com o compilador nativo; revertido para a série 5 com a suíte verde.

Erros fatais do ESLint chegam mascarados pelo proxy de output (RTK); o log completo fica em `~/Library/Application Support/rtk/tee/`.

Uma indisponibilidade temporária do executor de comandos engoliu a corrida vermelha do TDD nos contracts; compensada verificando a contagem de arquivos de teste antes do verde. Os ciclos red→green das demais tasks foram integrais.

**A arquitetura ajudou porque...**

Contratos definidos primeiro tornaram o core trivial de tipar e testar — nenhum teste precisou de mock (ADR-0004: dependências explícitas por parâmetro).

Os hooks do lifecycle (costura para a futura ativação de componentes) tornaram o estado `failed` alcançável e testável sem inventar componentes especulativos.

**A arquitetura atrapalhou porque...**

Nada a registrar — os limites (contracts sem dependências; core como composition root) couberam naturalmente no escopo.

**Precisamos mudar...**

TypeScript segue pinado na série 5 (encaminhamento: repetir o probe do TS7 na SPEC-0003; ao passar, despinar e remover a nota do CLAUDE.md).

---

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
