# ADR-0025 — Contabilidade de consumo de tokens exposta ao desktop

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-08-18

---

# Contexto

O painel de observabilidade de ambiente pedido pelo usuário (ver
[ADR-0024](ADR-0024-desktop-host-resource-metrics.md)) inclui consumo
de tokens do próprio Atlas em uso, ao lado de CPU/RAM/GPU/rede. O PRD
foi emendado (seção *Observabilidade do Ambiente*, 2026-08-18) para
cobrir essa visibilidade.

Hoje o Model Gateway (`packages/model-gateway`) não expõe consumo de
tokens: `GenerateResult` só tem `{ text }`
(`packages/contracts/src/model.ts`). O Module Catalog já lista
"métricas de uso" entre o que o Model Gateway **pode utilizar**, mas
não define quem acumula esse dado por sessão nem quem o expõe à UI —
e essa lacuna é exatamente o motivo da escalação do `spec-drafter`:
alterar `@atlas/contracts` e decidir o dono da acumulação são decisões
que a Emenda v1.1 reserva ao humano quando cruzam módulo.

Há também uma tensão aparente com a Restrição do PRD ("o Atlas não
deverá expor detalhes internos de sua arquitetura ao usuário durante o
uso normal") — o mesmo argumento que a Decisão de produto (2) do
ADR-0022 usou para recusar expor a escolha de *modelo* de STT na UI.
Este ADR resolve essa tensão explicitamente na Decisão (d).

---

# Decisão

**(a) `GenerateResult` ganha um campo opcional `usage`.** Mudança
aditiva em `packages/contracts/src/model.ts`:

```ts
export interface GenerateResult {
  text: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}
```

Todos os três subcampos são opcionais porque nem todo provedor reporta
os três. Nenhuma assinatura pública existente muda de forma
não-aditiva; nenhum consumidor atual de `GenerateResult` (`@atlas/core`,
`@atlas/cognitive`) é obrigado a lidar com o campo nesta fatia.

**(b) Cada provider do Model Gateway popula `usage` conforme o que a
própria resposta do provedor já carrega — sem chamada extra.**

- `remote` (`packages/model-gateway/src/providers/remote.ts`, schema
  OpenAI-compatível `chat/completions`): a resposta já inclui
  `usage.prompt_tokens`/`usage.completion_tokens`/`usage.total_tokens`
  — só mapear.
- `local`/Ollama (`.../providers/ollama.ts`): a resposta do
  `/api/chat` já inclui `prompt_eval_count`/`eval_count` — mapeados
  para `promptTokens`/`completionTokens`; `totalTokens` é a soma.
- `fake` (`.../providers/fake.ts`): sintetiza um valor determinístico
  (ex.: contagem de palavras da última mensagem e do texto de saída)
  — mantém os testes existentes determinísticos e dá ao caminho `fake`
  algo não-trivial para exercitar a UI sem exigir Ollama/rede real.

Nenhuma chamada de rede adicional é introduzida em nenhum provider — o
dado já vem de graça na resposta que cada um já faz.

**(c) A acumulação por sessão é local a `apps/desktop`, não em
`@atlas/contracts`/`@atlas/core`/Context Service/Memory Service.**
O main process (`core-bridge.ts`, ou um módulo companheiro novo,
`token-usage.ts`) soma o `usage` de cada `GenerateResult` retornado
pelas chamadas `ask`/`respond` (inclusive as `generate` internas de
planejamento/replanejamento/composição/extração do `runPlanCycle`,
quando o Cognitive Core as expuser) num contador **em memória**,
por sessão de chat/`ask`, exposto ao renderer por IPC. É **estado
temporário de UI**, não conhecimento persistente — não é o Context
Service (que representa estado de sessão/ambiente consumido pelo
Cognitive Core, Artigo 6) nem o Memory Service (autoridade de estado
persistente): o contador não sobrevive ao fechamento da sessão nem ao
reinício da app, e nenhuma Tool ou Skill o lê. Reseta quando uma nova
sessão de chat abre (mesmo evento que já limpa outros estados
transitórios do `core-bridge`, ex. `busySessions`).

**(d) Exibir consumo de tokens não viola a Restrição do PRD.** A
Restrição veta expor **detalhes internos de arquitetura** (ex. qual
provedor/modelo está em uso, como o Planner decide, o `denialKind`
interno). Um contador de tokens consumidos é uma **métrica de recurso
e custo**, do mesmo tipo de CPU/RAM — informa quanto foi gasto, não
como o Atlas é construído por dentro, e não revela `provider`/`model`
configurados. É tratado como decisão de produto, não como exceção à
Restrição.

---

# Decisões de produto (resolvidas em 2026-08-18)

1. **Granularidade exibida: total acumulado da sessão corrente.** Sem
   quebra por turno nem por chamada `generate` interna nesta fatia —
   simplicidade de UI, e o `usage` por chamada já fica disponível na
   estrutura para uma quebra mais fina ser extensão futura sem mudança
   estrutural.
2. **Sem custo monetário estimado.** Só a contagem de tokens; converter
   para custo em dinheiro dependeria de tabela de preço por
   provedor/modelo, decisão de produto fora de escopo desta fatia.

---

# Consequências

Positivas:

- `@atlas/contracts` ganha um campo aditivo, sem quebrar nenhum
  consumidor existente.
- Nenhum provider precisa de uma chamada de rede a mais — o dado já
  chega de graça na resposta existente.
- A acumulação fica inteiramente confinada a `apps/desktop`, no mesmo
  padrão de "módulo local, sem package novo" do ADR-0022(b) — zero
  módulo novo no Module Catalog.
- Resolve a tensão com a Restrição do PRD de forma explícita e
  documentada, em vez de deixá-la implícita.

Custos e riscos:

- **Cobertura desigual entre providers**: o `fake` nunca reflete
  consumo real (é sintético por definição); o valor exibido no
  desktop com `local`/`remote` depende de cada provedor de fato
  reportar `usage` no formato esperado — se um provedor futuro não
  reportar, o campo fica `undefined` e a UI mostra "indisponível" para
  aquele turno (mesma disciplina fail-closed do ADR-0024(d)), sem
  travar o resto do painel.
- **Sem persistência** significa que o usuário perde o total ao
  reiniciar a app — aceito nesta fatia (Decisão (c)); se histórico
  entre sessões vier a ser pedido, é uma decisão de produto nova
  (tocaria Memory/Activity Service) e exigiria ADR próprio.

---

# Alternativas Consideradas

**Acumular no Context Service (`packages/context`).** Rejeitada: o
Context Service representa estado de sessão **consumido pelo Cognitive
Core/Planner/Runtime** (Module Catalog) — consumo de tokens é dado de
apresentação para o usuário, não insumo para o ciclo cognitivo decidir
nada. Colocar ali misturaria uma responsabilidade nova ao módulo sem
necessidade, contra o Artigo 4.

**Persistir o total no Memory Service.** Rejeitada: contraria o
Artigo 6 (memória é conhecimento persistente, não telemetria efêmera de
UI) e o critério de "Não é responsável por... armazenar todo Log
indefinidamente" do próprio Memory Service no Module Catalog.

**Novo módulo `packages/telemetry` ou ampliar o Activity Service
(`packages/activity`, ainda não construído) para ser o dono da
acumulação.** Rejeitada nesta fatia pelo mesmo motivo do ADR-0022 ao
recusar um `packages/voice`: um único consumidor real (`apps/desktop`)
não justifica indireção nova (Artigo 4); Activity Service continua
reservado a "atividade observável do Atlas" (eventos/logs/Tasks), não
a métricas de recurso do host/uso. Promover para lá exigiria base
factual de um segundo consumidor (precedente ADR-0007).

---

# Observações

- O **contrato técnico exato** (nome dos canais IPC, forma do payload
  acumulado, ponto exato do `core-bridge.ts` onde a soma ocorre) é dado
  pela SPEC que implementa esta fatia, não duplicado aqui.
- Este ADR resolve, junto com o [ADR-0024](ADR-0024-desktop-host-resource-metrics.md),
  a escalação registrada pelo `spec-drafter` em 2026-08-18.
