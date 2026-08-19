# ADR-0024 — Métricas de recurso do host (CPU/RAM/GPU/rede) no desktop

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-08-18

---

# Contexto

O usuário pediu um painel na interface do desktop mostrando o consumo de
CPU, GPU, RAM e Wi-Fi da máquina local, ao lado do consumo de tokens
(ver [ADR-0025](ADR-0025-desktop-token-usage-accounting.md)) e do
relógio/data. O PRD foi emendado (seção *Observabilidade do Ambiente*,
2026-08-18) para cobrir essa visibilidade — até então "Transparência"
só tratava da atividade do próprio Atlas, não do ambiente onde ele roda.

O `spec-drafter`, ao tentar desenhar a SPEC correspondente, escalou por
três motivos; este ADR resolve os dois que dizem respeito a métricas de
host (o terceiro, tokens, é o ADR-0025):

1. Nenhum componente do Module Catalog é dono de telemetria do sistema
   operacional hospedeiro — Activity Service registra atividade do
   Atlas, não do host.
2. CPU e RAM têm API nativa no Node (`os.cpus()`/`os.freemem()`), mas
   utilização de **GPU** em tempo real e **tráfego de rede** não têm
   API portável sem ler comandos de SO (`powermetrics` no macOS exige
   sudo, `nvidia-smi`, `netstat`/`ifconfig`) ou trazer uma dependência
   nova — a classe de decisão que a Emenda v1.1 da Constituição reserva
   ao humano (mesmo raciocínio do ADR-0021/ADR-0022 ao introduzir Piper
   e `whisper.cpp`).

O usuário aprovou explicitamente trazer uma dependência nova, contanto
que ela não comprometa o funcionamento offline do Atlas.

---

# Decisão

**(a) Biblioteca: [`systeminformation`](https://www.npmjs.com/package/systeminformation).**
Pacote npm puro (sem binário nativo a compilar/empacotar), lê métricas
direto do SO local (via `/proc`, APIs do SO ou comandos já presentes no
sistema) e **não faz nenhuma chamada de rede** — preserva a garantia
offline endurecida pelo ADR-0021(c)/ADR-0022(c) sem abrir exceção a ela.
Cobre CPU (`currentLoad`), RAM (`mem`), GPU (`graphics`) e rede
(`networkStats`) com uma única dependência, em vez de quatro heurísticas
específicas de plataforma.

**(b) Módulo local a `apps/desktop`, não Tool em `@atlas/tools` nem
package novo.** Mesmo raciocínio do ADR-0022(b): leitura de métricas do
host para exibição não é uma ação de negócio que o Cognitive Core
planeja — é dado de apresentação local, lido sob demanda pela UI.
Confinado a `apps/desktop/src/system-metrics.ts` (novo), espelho
estrutural de `piper-tts.ts`/`stt-engine.ts`: só o main process importa
`systeminformation`; o renderer recebe os valores por IPC
(`'atlas:metrics:*'`), nunca a dependência diretamente (mesma fronteira
do ADR-0019 — `contextIsolation: true`, `nodeIntegration: false`).

**(c) Leitura por polling sob demanda, sem processo residente novo.**
O renderer chama o canal IPC (`invoke`) num intervalo curto (ordem de
poucos segundos, pinado pela SPEC) enquanto o painel de métricas estiver
visível; o main process não mantém nenhum timer ativo quando nenhum
renderer está observando. Diverge deliberadamente do Piper (ADR-0021),
que mantém processo de longa duração por ser acionado com alta
frequência sobre respostas curtas — aqui o custo de uma leitura pontual
de `systeminformation` é desprezível frente ao overhead de manter algo
residente. Não depende do canal de push (`webContents.send`) ainda
não construído (candidato aberto em `NEXT_CONTEXT.md`).

**(d) Fail-closed por métrica, não por painel inteiro.** Cada métrica
(CPU/RAM/GPU/rede) é reportada de forma independente. Quando a
plataforma não expõe um valor real (o caso mais provável é utilização
de GPU sem elevação de privilégio), a UI mostra explicitamente
"indisponível nesta plataforma" para aquela métrica específica — nunca
um valor inventado, nunca trava o painel inteiro, nunca cai para uma
fonte remota. CPU e RAM são consideradas sempre disponíveis (API do
Node já garante isso sem depender de `systeminformation`); GPU e rede
degradam de forma explícita quando necessário.

---

# Decisões de produto (resolvidas em 2026-08-18)

1. **Escopo de "rede" é taxa de tráfego (bytes/s enviados e recebidos
   pela interface ativa), não força de sinal Wi-Fi.** `systeminformation`
   não expõe RSSI de forma portável em todas as plataformas; taxa de
   tráfego (`networkStats`) é o dado que "gasto" mais naturalmente
   descreve e é portável.
2. **Sem histórico nem persistência.** Assim como o consumo de tokens
   (ADR-0025), as métricas de host são lidas e exibidas em tempo real,
   nunca gravadas — não é conhecimento persistente do Artigo 6, é
   telemetria efêmera da sessão de UI.

---

# Consequências

Positivas:

- Uma dependência só cobre as quatro métricas, em vez de quatro
  integrações heurísticas por plataforma.
- Nenhuma chamada de rede é introduzida — a garantia offline do
  ADR-0021(c)/ADR-0022(c) se estende à observabilidade de host sem
  exceção.
- Nenhum módulo novo no Module Catalog, nenhuma Tool nova, zero diff em
  `packages/*`/`@atlas/contracts` — mesmo padrão de confinamento a
  `apps/desktop` do ADR-0022(b).

Custos e riscos:

- **Dependência de execução nova** (`systeminformation`), ainda que sem
  binário nativo — soma-se ao Piper e ao `whisper.cpp` na superfície de
  terceiros que o app desktop carrega.
- **Cobertura de plataforma desigual**: GPU em especial pode reportar
  "indisponível" com frequência fora do Linux com drivers específicos —
  aceito explicitamente pela Decisão (d), não é considerado defeito.
- **Sem processo residente** significa uma leitura de I/O do SO a cada
  poll — aceitável na cadência de poucos segundos decidida em (c); se
  o custo se mostrar perceptível em uso real, a porta é local e a troca
  para cache com TTL é extensão futura sem mudança estrutural.

---

# Alternativas Consideradas

**Comandos de SO específicos por plataforma (`powermetrics`,
`nvidia-smi`, `netstat`), sem dependência nova.** Rejeitada: exigiria
manter três implementações divergentes, `powermetrics` no macOS pede
elevação de privilégio (inviável para um painel de UI comum), e o
ganho de "zero dependência nova" não compensa a fragilidade — o usuário
já autorizou trazer uma dependência desde que offline-safe.

**Processo de longa duração coletando métricas continuamente (molde do
Piper).** Rejeitada nesta fatia: o custo de uma chamada pontual de
`systeminformation` é baixo o bastante para não justificar um processo
residente; reconsiderar só se o polling sob demanda se mostrar
insuficiente em uso real.

**Push do main process para o renderer (`webContents.send`) em vez de
polling.** Rejeitada por ora: o canal de push é um candidato ainda não
construído (`NEXT_CONTEXT.md`); adotá-lo aqui acoplaria esta fatia a
uma peça de infraestrutura fora de escopo. Migrar de polling para push
depois é local ao renderer, sem mudar a Decisão (b)/(d).

---

# Observações

- O **contrato técnico exato** (canais IPC, intervalo de polling,
  formato dos valores, texto exato de "indisponível") é dado pela SPEC
  que implementa esta fatia, não duplicado aqui — mesmo enquadramento
  do ADR-0021/ADR-0022 em relação às suas SPECs.
- Este ADR resolve, junto com o [ADR-0025](ADR-0025-desktop-token-usage-accounting.md),
  a escalação registrada pelo `spec-drafter` ao tentar desenhar a SPEC
  de observabilidade de ambiente pedida pelo usuário em 2026-08-18.
