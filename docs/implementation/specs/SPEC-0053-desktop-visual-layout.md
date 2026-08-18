# SPEC-0053 — Núcleo holográfico volumétrico e navegação por drawer no `apps/desktop`

> **Project Atlas — Implementation Specification**

Version: 3.0

> **Gate v3.0 — tentativa 2.** O primeiro passe do
> `architecture-reviewer` confirmou o Perfil `completo` e preservou D1–D15,
> mas vetou cinco ambiguidades de aceite. Esta tentativa fecha: contagem da
> navegação sem confundir `Fechar`/controles internos; início de `speaking`
> somente em evento real de playback; manifesto exato de IDs HEAD/v3/v2;
> digest estável da nuvem de 400 pontos; e disclosures completos de Persona,
> Personas e Objetivo. Não houve escalação arquitetural.

> **v3.0 — novo redirecionamento integral aprovado pelo usuário.** A v2.0 foi
> implementada e tecnicamente validada com **1.322 testes em 80 arquivos** e os
> quatro gates completos da raiz verdes. No smoke humano, porém, falhou o
> Critério de Aceitação visual: sidebar e timeline ocupavam espaço permanente,
> o painel Memória sobrepunha/cortava conteúdo e o núcleo ainda parecia uma bola
> plana. A SPEC voltou de `Review` para `In Progress`; a direção v2.0 não foi
> aceita nem pode ser fechada.
>
> Esta v3.0 substitui integralmente as direções v1.x e v2.0 incompatíveis. O
> usuário aprovou visualmente a nova direção — esfera holográfica volumétrica de
> pontos, sem órbitas externas — e autorizou seguir. O código local existente é
> somente material de adaptação. Esta versão reinicia o gate em `Draft` e é a
> única autoridade para a próxima implementação.

---

# Informações Gerais

**ID**

SPEC-0053

---

**Título**

Núcleo holográfico volumétrico, navegação por drawer e sessão sob demanda no
desktop

---

**Status**

- [ ] Draft
- [ ] Ready
- [ ] In Progress
- [ ] Review
- [x] Done

---

**Prioridade**

- [ ] Critical
- [ ] High
- [x] Medium
- [ ] Low

---

**Perfil**

- [ ] micro
- [x] completo

---

**Item do Roadmap**

`Fase 2 — 2.1 Fundação da Interface`, como extensão consciente da casca visual
do `apps/desktop`.

A fatia reorganiza os Input/Output Gateways sem reabrir as capacidades já
entregues pelos itens 2.2 (conversa), 2.3 (voz) e 2.4 (gerência local). A base
de produto vem do PRD: texto e voz, conversas contínuas, acompanhamento de
progresso, histórico consultável, personalização, simplicidade, consistência e
transparência.

---

# Objetivo

Quando esta SPEC estiver concluída, o `apps/desktop` deverá apresentar o Atlas
como uma presença holográfica genuinamente volumétrica, semelhante a um planeta
de partículas em rotação, com o núcleo como maior elemento e centro inequívoco
da tela.

A conversa corrente e o composer ficarão imediatamente abaixo do núcleo. Toda
gerência lateral ficará fechada por default e abrirá como drawer sobreposto,
sem reservar largura nem deslocar o núcleo. A timeline deixará de ocupar a
parte inferior da janela e passará a viver no item `Sessão` desse drawer.

Painéis e listas revelarão detalhes progressivamente, sem sobrepor nem cortar
seu próprio conteúdo. A interface usará uma paleta roxo-realeza, sem emojis em
rótulos ou controles. Durante TTS real, os próprios pontos do núcleo formarão
uma onda procedural e retornarão suavemente ao giro estável quando a fala
terminar. Todos os comportamentos já entregues — chat, `ask`, Persona, Memória,
Permissões, STT, TTS, hands-free, cancelamento e serialização — permanecerão
inalterados em capacidade e fronteira.

---

# Motivação

O PRD exige uma experiência simples, consistente e transparente, com interação
por texto e voz, conversas contínuas, progresso e histórico consultável. As
SPECs 0031–0052 entregaram essas capacidades. Esta SPEC existe para dar a elas
uma hierarquia visual coerente com uma única Persona percebida.

A v2.0 provou tecnicamente sua estrutura, mas o smoke humano demonstrou que a
hierarquia continuava errada: controles e timeline competiam permanentemente
com a presença, detalhes de Memória não cabiam no painel e gradientes/halos CSS
não produziam profundidade suficiente. Como o objetivo é perceptivo, gates
técnicos verdes não compensam uma reprovação humana.

A direção aprovada corrige esses três problemas sem criar arquitetura nova:
libera o palco central, move navegação e histórico para um drawer sob demanda e
usa uma projeção tridimensional local de partículas. Isso permanece dentro dos
Input/Output Gateways atribuídos pelo Module Catalog a `apps/*`.

---

# Referências

- [PRD](../../02-product/ProductRequirementsDocument.md) — Comunicação,
  Planejamento, Execução, Memória, Personalização, Transparência, Critérios de
  Qualidade e Escopo Inicial.
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) —
  Artigos 1, 2, 4, 5, 7, 9, 11, 14 e 15; Emendas v1.1 e v1.2.
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — Input Gateway e
  Output Gateway em `apps/*`; apresentação de texto, voz, progresso, erros,
  confirmações e timeline resumida.
- [Roadmap](../../04-engineering/Roadmap.md) — Fase 2, itens 2.1–2.4.
- [ADR-0019](../../06-adr/ADR-0019-desktop-electron-stack.md) — Electron,
  renderer clássico sem bundler, Core somente no main process e IPC como
  fronteira exclusiva.
- [ADR-0020](../../06-adr/ADR-0020-persona-persistence-voice-binding.md) —
  Persona persistível e voz vinculada sem persistência no renderer.
- [ADR-0021](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md) — TTS local,
  Piper e fallback fail-closed.
- [ADR-0022](../../06-adr/ADR-0022-whisper-cpp-local-stt-engine.md) — STT local,
  push-to-talk e ausência de persistência de áudio/transcrição.
- [ADR-0023](../../06-adr/ADR-0023-hands-free-voice-conversation.md) — modo
  hands-free opt-in e sua máquina de estados.
- [SPEC-0045](SPEC-0045-renderer-automated-coverage.md) e
  [SPEC-0047](SPEC-0047-renderer-parity-gate-and-panel-coverage.md) — harness
  jsdom, paridade renderer↔módulo e cobertura comportamental dos painéis.
- [SPEC-0048](SPEC-0048-desktop-chat-send-ask-serialization.md),
  [SPEC-0049](SPEC-0049-desktop-ask-form-serialization-and-error-surfacing.md),
  [SPEC-0050](SPEC-0050-core-bridge-structural-gesture-serialization.md) e
  [SPEC-0051](SPEC-0051-desktop-cancel-in-flight-operation.md) — serialização,
  erros e cancelamento preservados.
- [SPEC-0052](SPEC-0052-desktop-hands-free-voice-conversation.md) — estados e
  gestos de voz já observáveis pelo renderer.
- `apps/desktop/CLAUDE.md` — fronteiras atuais do renderer, painéis, voz,
  serialização e smoke real.
- Direção visual final aprovada pelo usuário nesta iteração da SPEC-0053.

---

# Escopo

## 1. Casca central sem regiões permanentes laterais ou inferiores

- Reestruturar `index.html` para que a área principal ocupe todo o viewport e
  contenha uma única coluna visual: núcleo, leitura textual de estado, resposta
  corrente, controles de voz e composer.
- O núcleo é o maior elemento individual e fica centralizado. `#current-reply`,
  `#show-complete-reply`, a área de voz e `#chat-form` aparecem imediatamente
  abaixo dele, na mesma pilha de fluxo normal.
- Remover a sidebar/trilho que reservava coluna e remover a timeline inferior
  permanente. Nenhuma região vazia pode continuar reservando a largura ou a
  altura que essas superfícies ocupavam na v2.0.
- Preservar exatamente os 47 `id` do baseline aceito no `HEAD`, enumerados no
  manifesto abaixo. IDs estruturais exclusivos da v2.0 rejeitada não são
  baseline e obedecem ao manifesto explícito de inclusão/remoção.
- Manter uma única folha local `styles.css`, referenciada por um único
  `<link rel="stylesheet" href="./styles.css">`, sem CSS inline, recurso remoto,
  bundler ou dependência.
- Preservar `[hidden] { display: none !important; }` e a CSP atual byte a byte.

### Manifesto vinculante de IDs

Os **47 IDs do `HEAD`**, todos obrigatórios na v3.0, são:

```text
status
persona-select
persona-error
persona-list
persona-new
persona-form
persona-form-id
persona-name
persona-tone
persona-formality
persona-language
persona-style
persona-communication-rules
persona-voice
persona-emotion
persona-voice-uri
persona-voice-legacy
persona-test-voice
persona-form-save
persona-form-cancel
persona-form-error
ask-form
objective
ask-submit
ask-cancel
ask-result
chat-transcript
chat-form
chat-input
chat-send
chat-cancel
mic-button
mic-cancel-button
mic-status
hands-free-toggle
hands-free-indicator
hands-free-status
memory-refresh
memory-list
read-roots-list
read-root-input
read-root-add
write-roots-list
write-root-input
write-root-add
permissions-apply
permissions-error
```

Os **30 IDs estruturais adicionais obrigatórios da v3.0** são:

```text
menu-toggle
drawer-backdrop
panel-drawer
drawer-close
drawer-navigation
drawer-panels
panel-persona
persona-status-toggle
panel-personas
panel-memory
memory-error
panel-permissions
read-roots-toggle
read-roots-detail
write-roots-toggle
write-roots-detail
panel-objective
ask-result-toggle
panel-session
presence-stage
presence-core
presence-canvas
presence-persona
presence-state
global-alert
current-reply
show-complete-reply
timeline-region
new-activity
timeline-detail
```

O HTML estático contém exatamente a união desses 77 IDs, sem IDs estruturais
adicionais implícitos. IDs dinâmicos de fatos/eventos podem ser gerados somente
para associação `aria-controls`/seleção, com prefixos `memory-detail-` e
`session-event-`; eles não alteram o manifesto estático.

Artefatos exclusivos da v2.0 rejeitada que **devem desaparecer**:

- ID `panel-rail`;
- classes `control-side`, `panel-rail`, `panel-stack`, `core-orb` e `core-halo`;
- regras de layout que criam coluna lateral reservada, linha divisória lateral
  ou linha permanente inferior para a timeline.

`app-shell`, `atlas-main`, `timeline-region` e `timeline-heading` não são, por
si, artefatos proibidos: podem permanecer somente se recompostos dentro da
casca central/drawer e sem restaurar a geometria rejeitada.

## 2. Botão de menu e drawer sobreposto

- Criar `#menu-toggle`, controle textual `Menu`, no canto superior esquerdo.
  Ele terá alvo mínimo de 44 × 44 CSS px, `aria-controls="panel-drawer"` e
  `aria-expanded` sincronizado.
- `#panel-drawer` fica fechado no boot, fora da ordem visual e de foco. Ao
  abrir, aparece como drawer/overlay sobre a borda esquerda, acompanhado de
  backdrop; não altera `grid`, largura, margem, `transform` nem caixa calculada
  do palco/núcleo.
- O drawer usa `role="dialog"`, `aria-modal="true"` e nome acessível
  `Navegação e painéis do Atlas`; o backdrop é estritamente decorativo e não
  recebe foco.
- O drawer terá largura máxima de 360 CSS px e, em viewports menores,
  `min(360px, calc(100vw - 32px))`; altura limitada ao viewport e rolagem
  vertical própria. Painéis vivem no fluxo normal interno, nunca em posições
  absolutas sobre outros painéis.
- Abrir leva foco ao primeiro controle do menu. `Escape`, o backdrop e o
  controle textual `Fechar` fecham o drawer; o foco retorna a `#menu-toggle`.
  Enquanto aberto, o foco de teclado permanece contido no drawer.
- `#drawer-navigation` contém exatamente seis controles de navegação de painel,
  identificados por `data-drawer-nav`, nesta ordem: `Persona`, `Personas`,
  `Memória`, `Permissões`, `Objetivo`, `Sessão`. A contagem exclui
  `#drawer-close`, `#menu-toggle`, controles de disclosure, formulários, listas
  e ações internas dos painéis; nenhum desses elementos recebe
  `data-drawer-nav`.
- O drawer abre sem painel selecionado. Clicar num item abre seu painel e fecha
  o anterior; clicar no item ativo o fecha. A invariante é zero ou um painel
  visível. A escolha é efêmera e não é persistida.
- Remover `<hr>`, régua da barra, `border-left`, `border-right` e
  pseudo-elementos usados como linhas/separadores na navegação, nos itens de
  detalhe e nos eventos da sessão. Agrupamento será comunicado por espaço,
  superfície e tipografia, não por linhas verticais.

## 3. Progressive disclosure sem sobreposição ou corte

- Todo painel permanece no DOM e conserva seus formulários, listas, resultados,
  controles e regiões de erro atuais.
- Conteúdo primário fica visível; metadados, resultados longos, formulários de
  edição e detalhes ficam em containers de disclosure no fluxo normal,
  controlados por botões com `aria-expanded` e `aria-controls`.
- Containers de detalhe começam fechados quando não há uma ação atual que exija
  o contrário. Estado de disclosure não é persistido.
- Nenhum painel ou detalhe usa `position: absolute`/`fixed`, altura rígida com
  `overflow: hidden` ou truncamento sem uma ação que revele o conteúdo integral.
  Texto longo quebra linha; o drawer rola quando o conjunto excede sua altura.
- Memória apresenta cada fato por um título compacto determinístico: dividir
  por `/\r\n|[\n\r]/`, aplicar `trim` a cada linha e escolher a primeira não
  vazia; acima de 72 pontos de código, usar os primeiros 69 + `…`; sem linha
  não vazia, usar `Memória sem título`. Clicar no título alterna um detalhe com
  o texto integral byte a byte, `id`, data, origem, categoria, `subject` quando
  presente e a ação `Esquecer`.
- Em Memória, no máximo um fato fica expandido por vez. Atualizar a lista ou
  esquecer um fato fecha o detalhe anterior sem alterar a semântica dos
  round-trips `memory.list`/`memory.forget`.
- Em Permissões, `Leitura (<n>)` e `Escrita (<n>)` são resumos compactos que
  funcionam como `#read-roots-toggle` e `#write-roots-toggle`, controlando,
  respectivamente, `#read-roots-detail` e `#write-roots-detail`, containers das
  listas/inputs de leitura e escrita. Ambos começam recolhidos
  (`aria-expanded="false"`, conteúdo `hidden`). `Aplicar` e
  `#permissions-error` ficam no conteúdo primário, sempre alcançáveis sem hover.
- **Persona:** conteúdo primário é `#persona-select` + `#persona-error`.
  `#persona-status-toggle`, texto `Detalhes da Persona`, controla diretamente
  `#status`. No boot, toggle tem `aria-expanded="false"` e `#status` está
  `hidden`; atualizar o status nunca o expande automaticamente.
- **Personas:** conteúdo primário é `#persona-list`, `#persona-new` e
  `#persona-form-error`. O conteúdo recolhido é `#persona-form`, inicialmente
  `hidden`. `#persona-new` e cada ação dinâmica `Editar` declaram
  `aria-controls="persona-form"`; `Nova Persona`/`Editar` abrem o formulário
  com `aria-expanded="true"` somente no controle invocador e `false` nos demais,
  enquanto salvar com sucesso ou
  `#persona-form-cancel` o fecha e devolve todos esses controles para
  `aria-expanded="false"`. Falha de save mantém o formulário aberto.
- **Objetivo:** conteúdo primário é `#ask-form`. O conteúdo recolhido é
  `#ask-result`; `#ask-result-toggle`, texto inicial `Ver resultado`, controla
  esse elemento. No boot, toggle e resultado estão `hidden`, com
  `aria-expanded="false"`. Um submit aceito escreve `Processando…`, mostra o
  toggle como `Ocultar resultado`, marca `aria-expanded="true"` e revela o
  resultado; sucesso, erro ou cancelamento substituem o conteúdo sem recolhê-lo.
  O usuário pode alternar `Ver resultado`/`Ocultar resultado`; novo submit
  aceito volta a abri-lo. Submit recusado pelas guardas não muda o disclosure.

## 4. Sessão absorve integralmente a timeline

- Criar `#panel-session` como sexto painel. Mover para dentro dele
  `#timeline-region`, `#chat-transcript`, `#new-activity` e `#timeline-detail`.
  Não pode existir cópia, espelho ou placeholder da timeline fora do drawer.
- Reaproveitar o protocolo tipado já tecnicamente validado na v2.0. Cada evento
  recebe uma das tuplas fechadas:

  | `type` | `kind` autorizado |
  |---|---|
  | `user` | `message` |
  | `assistant` | `reply` |
  | `tool` | `step` |
  | `memory` | `learned` |
  | `system` | `session-opened`, `session-reopened-persona`, `session-reopened-permissions`, `cancelled` |
  | `error` | `boot-failure`, `session-failure`, `chat-failure`, `voice-failure` |

- Um turno aceito acrescenta `user/message` uma única vez antes de
  `window.atlas.chat.send`. Em sucesso, acrescenta `tool/step*`,
  `assistant/reply` e `memory/learned*`, nessa ordem e preservando as ordens dos
  arrays. Falha comum cria um `error/chat-failure`; cancelamento confirmado
  cria um único `system/cancelled`, sem erro duplicado.
- Eventos de abertura/reabertura só existem depois de `chat.open()` resolver.
  Reabertura rejeitada preserva o histórico anterior e cria um único
  `error/session-failure`.
- Itens da Sessão aparecem como títulos compactos selecionáveis. Selecionar um
  item revela `#timeline-detail` no fluxo normal com o conteúdo integral.
- Preservar a rolagem condicional validada na v2.0: distância do fim `<= 48`
  px permite auto-scroll; acima disso, a posição não muda e
  `#new-activity` acumula a contagem até clique ou rolagem manual ao fim.
- Fechar o drawer ou o painel Sessão não limpa eventos, seleção, detalhe ou
  contador. Nada é persistido entre execuções da app.

## 5. Resposta corrente e abertura do histórico sob demanda

- Preservar a classificação de resposta curta da v2.0:
  `Array.from(text).length <= 480 && logicalLineCount(text) <= 4`, com
  `logicalLineCount` dividindo por `/\r\n|[\n\r]/` e contando linhas vazias,
  inclusive a final.
- Resposta curta aparece integralmente abaixo do núcleo. Resposta longa mantém
  o texto integral no DOM, recebe clamp visual de quatro linhas e oferece o
  controle textual `Ver resposta completa`.
- `Ver resposta completa` abre o drawer, seleciona `Sessão`, seleciona o evento
  `assistant/reply` correspondente, revela o texto integral e move foco ao
  detalhe. Não chama `window.atlas`, não envia prompt e não gera resumo.
- Iniciar um novo turno limpa somente a resposta corrente do palco; o histórico
  permanece em Sessão.

## 6. Núcleo point cloud com projeção tridimensional real

- Substituir `.core-orb`, `.core-halo` e qualquer esfera feita só de gradiente
  CSS por um único `<canvas id="presence-canvas" aria-hidden="true">` dentro de
  `#presence-core`, acompanhado de `#presence-persona` e `#presence-state` como
  fonte textual acessível.
- Usar somente Canvas 2D nativo do Chromium. WebGL, SVG animado, vídeo, imagem,
  asset remoto, biblioteca gráfica e dependência nova permanecem proibidos.
- Gerar deterministicamente a nuvem uma vez: 320 pontos sobre a superfície por
  distribuição Fibonacci com ângulo áureo `π × (3 - √5)`, e 80 pontos internos
  com PRNG `mulberry32` de semente hexadecimal `0x0a71a5`. Para cada ponto
  interno, três amostras `u/v/w` definem `z = 1 - 2u`, azimute `2πv` e raio
  `cbrt(w)`, produzindo distribuição volumétrica uniforme. Não usar
  `Math.random()`.
- O algoritmo e a ordem são vinculantes: superfície primeiro, índices
  `i = 0..319`, com `y = 1 - 2i/319`,
  `ring = sqrt(max(0, 1 - y²))`, `theta = i × goldenAngle`,
  `x = cos(theta) × ring`, `z = sin(theta) × ring`; interiores depois, na
  ordem das três amostras do PRNG, com
  `axis = 1 - 2u`, `ring = sqrt(max(0, 1 - axis²))`, `radius = cbrt(w)`,
  `x = cos(2πv) × ring × radius`, `y = axis × radius` e
  `z = sin(2πv) × ring × radius`.
- `mulberry32` usa aritmética JS de 32 bits exatamente nesta forma:

  ```text
  a = seed >>> 0
  next():
    t = (a += 0x6d2b79f5)
    t = imul(t ^ (t >>> 15), t | 1)
    t ^= t + imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  ```

- A prova mecânica serializa os 400 pontos na ordem de geração como
  `<layer>:<x.toFixed(6)>,<y.toFixed(6)>,<z.toFixed(6)>`, uma linha por ponto,
  sem newline final, com `layer` igual a `surface` ou `inner`. O SHA-256 UTF-8
  obrigatório é
  `e34bba11376031468c7b70c1a0e904eeed2871c0dc80d1485fd8368c7b3ecdb6`.
  Sentinelas adicionais: índice `0` =
  `surface:0.000000,1.000000,0.000000`, índice `319` =
  `surface:0.000000,-1.000000,0.000000`, índice `320` =
  `inner:-0.756200,-0.130314,0.369031` e índice `399` =
  `inner:-0.599836,-0.667884,-0.224146`.
- Em cada frame, aplicar rotação em coordenadas `x/y/z`, projeção perspectiva,
  ordenação de trás para frente e escala/opacidade dependentes de `z`. Pontos
  traseiros devem ser menores e menos opacos que pontos frontais equivalentes.
- Renderizar somente partículas circulares e um glow difuso de fundo. Não
  desenhar segmentos, meridianos, grades, anéis, trilhos, caudas ou órbitas; o
  Canvas não usa `lineTo`, `stroke` ou paths lineares para o núcleo.
- O tamanho visual da esfera usa `clamp(220px, 44vmin, 340px)` e o backing store
  respeita `devicePixelRatio` limitado a 2. Resize recalcula a projeção sem
  distorcer a razão 1:1.
- `pointermove` sobre o palco altera suavemente yaw/pitch de perspectiva, com
  limite de ±12 graus. O valor corrente converge ao alvo por fator temporal
  `1 - exp(-deltaMs / 120)`; `pointerleave` define alvo neutro e usa a mesma
  convergência. A rotação autônoma continua independente do ponteiro.
- Se `getContext('2d')` falhar, o texto de Persona/estado e todos os controles
  continuam funcionais; não criar erro global só pela ausência do efeito
  decorativo.

## 7. Estados vivos e onda de fala ligada ao TTS real

Manter uma única derivação local para `#presence-core[data-state]`, nesta
prioridade:

| Estado | Sinal real já observado | Movimento com animação permitida |
|---|---|---|
| `error` | erro global não vazio | jitter angular contido e pulso rosa-violeta irregular |
| `speaking` | `playbackActive === true`, depois do evento nativo real de início e antes do terminal real | onda radial viajante nos próprios pontos |
| `thinking` | chat/ask em voo, hands-free em `sending`/`thinking`, ou `playbackPending === true` antes de áudio real/fallback | rotação mais rápida + cintilação interna |
| `transcribing` | mic ou hands-free em `transcribing` | compressão/expansão latitudinal sequencial |
| `listening` | mic em `recording` ou hands-free em `listening`/`capturing` | respiração volumétrica lenta |
| `booting` | boot/sessão inicial ainda não assentados | formação gradual da nuvem |
| `ready` | nenhum caso anterior | giro planetário lento e estável |

- O mapa de perfis fixa os seguintes parâmetros sobre raio normalizado; `Hz`
  mede ciclos por segundo e velocidade mede radianos por segundo:

  | Estado | rotação Y | deformação temporal | intensidade máxima | token principal |
  |---|---:|---|---:|---|
  | `ready` | `0.16` | nenhuma | `0` | `--royal-bright` |
  | `booting` | `0.12` | formação `easeOutCubic` nos primeiros `900 ms` do estado | `1 → 0` | `--royal-soft` |
  | `listening` | `0.22` | respiração radial senoidal a `0.65 Hz` | `0.08` | `--royal-lilac` |
  | `transcribing` | `0.32` | onda latitudinal a `1.8 Hz` | `0.06` | `--royal-magenta` |
  | `thinking` | `0.55` | cintilação interna a `2.2 Hz` | `0.18` de alpha | `--royal-violet` |
  | `speaking` | `0.28` | onda radial viajante a `2.4 Hz` | `0.12` | `--royal-bright` |
  | `error` | `0.08` | jitter angular determinístico a `7 Hz` | `±2°` | `--royal-error` |

- A configuração dos sete estados vive num mapa fechado único. Perfis têm
  combinações distintas de velocidade, deformação e intensidade; nenhuma
  função de fluxo aplica classes visuais independentes.
- O renderer mantém dois sinais visuais locais, comuns a playback manual e
  hands-free: `playbackPending` e `playbackActive`. Solicitar fala aceita marca
  somente `playbackPending = true`; nunca marca `speaking` por clique, resolução
  de IPC, `audio.play()` resolvido, criação do utterance, `canplay` ou pelo valor
  isolado `handsFreeState === 'speaking'`.
- No backend Piper/`<audio>`, somente o primeiro evento nativo `playing` da
  tentativa corrente faz, atomicamente, `playbackPending = false` e
  `playbackActive = true`. `ended` conclui a fala; `error`, `abort` ou `pause`
  causado por cancelamento/substituição encerram a atividade. Eventos de uma
  tentativa substituída são ignorados por token de identidade da tentativa.
- No fallback Web Speech API, somente `SpeechSynthesisUtterance.onstart` da
  tentativa corrente ativa `playbackActive`. `onend` conclui; `onerror` encerra
  ou inicia o próximo fallback conforme a política existente. Criar o utterance
  ou chamar `speechSynthesis.speak()` não ativa `speaking`.
- Falha Piper **antes** de `playing` conserva `playbackPending = true` enquanto
  o fallback do SO é tentado e nunca exibe `speaking`; somente `onstart` do
  utterance poderá ativá-lo. Se Piper falhar **depois** de `playing`, o handler
  terminal faz `playbackActive = false` e `playbackPending = true` antes do
  fallback: a sequência visual é `speaking → thinking → speaking` somente se o
  fallback realmente emitir `onstart`.
- `ended`/`onend` processam atomicamente o callback de conclusão do hands-free,
  limpam `playbackPending/playbackActive` e só então recalculam o núcleo, evitando
  frame falso entre o fim do áudio e o próximo estado. Cancelamento ou
  substituição limpa ambos imediatamente depois de pausar/cancelar o backend.
  Falha final dos backends limpa ambos e segue a taxonomia existente de erro
  global; término/falha sem evento de início nunca produz `speaking`.
- `speaking` usa uma onda procedural sobre raio/longitude/latitude dos próprios
  pontos. Ela não precisa representar amplitude real do áudio, mas sua
  envoltória-alvo é diferente de zero somente enquanto o estado real for
  `speaking`, isto é, somente enquanto `playbackActive === true`.
- Ao entrar em `speaking`, a envoltória usa `easeOutCubic` de `0 → 1` em
  `160 ms`. Ao sair pelo callback real de conclusão/cancelamento/falha do
  playback, usa `easeOutCubic` do valor corrente até zero em `450 ms`, sem salto
  de geometria, e o núcleo volta ao perfil do novo estado.
- `handsFreeState === 'arming'` continua comunicado pelo texto existente, mas
  não cria oitavo estado. Não inventar estado de autorização: o renderer não
  observa o ciclo do `ConfirmPort`.
- `#presence-state` acompanha sempre o `data-state`; movimento e cor nunca são
  a única forma de comunicar o estado.

## 8. Reduced motion e ciclo de animação

- Usar uma única instância de `requestAnimationFrame`, iniciada uma vez e
  cancelada no teardown da página. Mudança de estado não cria loops paralelos.
- Observar `prefers-reduced-motion: reduce` por `matchMedia`. Quando ativo,
  cancelar o loop contínuo, zerar deformações temporais/onda/jitter e desenhar
  um frame estático volumétrico por estado ou resize.
- No modo reduzido, manter `#presence-state`, diferenças estáticas de cor e toda
  interação; ponteiro não anima a perspectiva.
- A folha também desliga transições e animações CSS não essenciais dentro da
  media query correspondente.

## 9. Paleta roxo-realeza e texto sem emoji

- Centralizar cores, tipografia, espaço, raios, elevação e movimento em custom
  properties. A família primária usa fundo ameixa/preto, superfícies púrpura,
  roxo-realeza, violeta, lilás e magenta; azul/ciano deixam de ser cor de energia
  ou destaque.
- A variante clara fixa `--surface-base: #f7f2ff`,
  `--surface-raised: #eee5ff`, `--ink-primary: #211333`,
  `--royal-deep: #321268`, `--royal-bright: #7c3aed`,
  `--royal-violet: #8b5cf6`, `--royal-soft: #c7adff`,
  `--royal-lilac: #d8c8ff`, `--royal-magenta: #c84ad8` e
  `--royal-error: #c92c5b`. A media query escura redefine, respectivamente,
  para `#090612`, `#171024`, `#f6f0ff`, `#23084a`, `#a875ff`, `#9168ff`,
  `#b99aff`, `#dfd2ff`, `#df6bea` e `#ff6685`.
- `prefers-color-scheme` mantém variantes clara/escura com os tokens fixados
  acima, ambas na identidade roxo-realeza. Não criar seletor manual nem
  persistência de tema.
- Rótulos e controles produzidos pelo HTML/renderer usam texto ou CSS, nunca
  emojis. Isso inclui `Falar`, `Parar gravação`, `Ouvir`, `Ligar conversa
  contínua` e `Desligar conversa contínua`, além de menu, sessão e ações de
  painel.
- Texto recebido do usuário/modelo não é filtrado nem alterado. Mensagens
  históricas de erro conservam seu conteúdo, sem que isso autorize emoji como
  ícone de controle.

## 10. Preservação funcional e erros por origem

- Preservar push-to-talk, hands-free opt-in desligado por default, TTS por
  resposta, entrada textual, chat multi-turno, `ask`, CRUD/seleção de Persona,
  Memória, Permissões, cancelamento e todas as guardas de serialização.
- Não alterar `window.atlas`, preload, IPC, `core-bridge`, main process,
  snapshots, contratos, motores ou portas.
- Falhas globais de boot, sessão, chat e somente falhas reais de voz continuam
  alimentando `#global-alert`, `data-state="error"` e o evento global único já
  validado na v2.0.
- Indisponibilidade esperada, recusa de microfone, entrada corrigível,
  cancelamento e fallback Piper→SO bem-sucedido continuam locais e não viram
  erro global. `turnFailed` não duplica `error/chat-failure`.
- Erros de Persona, Personas, Memória, Permissões e Objetivo permanecem no
  painel de origem e nunca abrem o drawer ou trocam de painel automaticamente.

## 11. Testes e novo smoke bloqueante

- Reescrever/adaptar `apps/desktop/tests/renderer.layout.test.ts` para a v3.0,
  removendo asserções incompatíveis de sidebar, trilho fixo, timeline inferior,
  `.core-orb`, `.core-halo` e esfera HTML/CSS-only.
- Dublar `CanvasRenderingContext2D`, `requestAnimationFrame`, `matchMedia`,
  `devicePixelRatio` e eventos de ponteiro no harness jsdom, sem instalar
  biblioteca de Canvas.
- Cobrir DOM, drawer, foco/ARIA, progressive disclosure, Sessão/timeline,
  projeção/depth, perfis de estado, onda de fala, reduced motion, paleta, texto
  sem emoji e regressão dos comportamentos existentes.
- Executar novo smoke visual humano integral em janela real. A aprovação do
  protótipo orienta a implementação, mas não substitui o smoke do código final.

---

# Fora do Escopo

- Manter sidebar/trilho com largura reservada, timeline inferior permanente,
  bolhas de chat ou a esfera plana `.core-orb`/`.core-halo` das direções
  anteriores.
- Desenhar órbitas, trilhos, anéis, grades, meridianos, caudas ou linhas
  externas circulando o núcleo.
- Alterar `apps/desktop/src/main.ts`, `core-bridge.ts`, `preload.cjs`, canais
  IPC, diálogos nativos, snapshots, portas ou contratos.
- Alterar `packages/*`, `apps/cli`, Core, Cognitive, Runtime, Tools, Memory,
  Persona ou Permission Service.
- Alterar TTS, STT, VAD, Piper, Whisper, `hands-free.ts`, `speech-output.ts`,
  `piper-tts.ts`, `stt-engine.ts`, `vad-resources.ts` ou
  `media-permission.ts`.
- WebGL, Three.js, SVG animado, vídeo, imagem remota, framework de UI,
  biblioteca de componentes, bundler, pré-processador CSS ou dependência nova.
- Capturar amplitude real do TTS, analisar o áudio de saída ou criar novo IPC
  de amplitude; a onda é procedural e orientada pelo estado real.
- Persistir drawer, painel, disclosure, sessão/timeline, detalhe, rolagem,
  orientação do núcleo, reduced motion ou tema.
- Criar Activity Service, Voice Service, Event Bus, módulo, Tool, Skill,
  Persona ou contrato.
- Gerar resumo/título por modelo, chamar o Core novamente para apresentação ou
  alterar texto recebido.
- Wake word, barge-in, streaming de token/áudio, persistência de conversa entre
  execuções, responsividade móvel ou redesign de diálogos nativos.
- Corrigir débitos adjacentes, modularizar `renderer.js` ou ampliar o gate de
  paridade além do necessário para manter as suítes atuais verdes.

---

# Pré-requisitos

Todos conferidos como `Done` nos respectivos arquivos:

- [SPEC-0031](SPEC-0031-desktop-foundation.md),
  [SPEC-0032](SPEC-0032-desktop-confirm-steps-adapters.md) e
  [SPEC-0033](SPEC-0033-desktop-visual-chat.md) — fundação, `ask`, chat e traço.
- [SPEC-0034](SPEC-0034-desktop-visual-memory-management.md),
  [SPEC-0037](SPEC-0037-desktop-runtime-persona-switch.md),
  [SPEC-0038](SPEC-0038-desktop-permission-roots-gui.md) e
  [SPEC-0039](SPEC-0039-desktop-persona-authoring.md) — gerência visual.
- [SPEC-0045](SPEC-0045-renderer-automated-coverage.md) e
  [SPEC-0047](SPEC-0047-renderer-parity-gate-and-panel-coverage.md) — harness e
  cobertura do renderer.
- [SPEC-0046](SPEC-0046-desktop-voice-input-stt.md) — push-to-talk.
- [SPEC-0048](SPEC-0048-desktop-chat-send-ask-serialization.md),
  [SPEC-0049](SPEC-0049-desktop-ask-form-serialization-and-error-surfacing.md),
  [SPEC-0050](SPEC-0050-core-bridge-structural-gesture-serialization.md) e
  [SPEC-0051](SPEC-0051-desktop-cancel-in-flight-operation.md) — serialização,
  erros e cancelamento.
- [SPEC-0052](SPEC-0052-desktop-hands-free-voice-conversation.md) — conversa
  contínua e estados de voz.

---

# Critérios de Aceitação

## Estrutura e drawer

1. O diff de produção da SPEC contém somente
   `apps/desktop/src/renderer/index.html`, `styles.css` e `renderer.js`; nenhum
   arquivo de `packages/*`, main/preload/bridge, voz ou IPC é alterado.
2. `index.html` referencia exatamente `./styles.css`, não contém `<style` nem
   atributo `style=`, conserva a CSP byte a byte e seu conjunto estático de IDs
   é exatamente a união dos 47 IDs HEAD + 30 IDs v3 do manifesto. O teste de
   boot continua verde; `panel-rail` e as cinco classes v2 enumeradas não
   existem, e IDs dinâmicos usam somente os dois prefixos autorizados.
3. A área principal possui uma única pilha central na ordem núcleo → estado e
   resposta → voz → `#chat-form`. `#timeline-region` aparece uma única vez,
   descendente de `#panel-session`, e não há sidebar, trilho ou região inferior
   reservando espaço.
4. `#menu-toggle` mede no mínimo 44 × 44 CSS px, inicia com
   `aria-expanded="false"` e o drawer oculto. Abrir/fechar não altera o
   `getBoundingClientRect()` dublado do palco nem do núcleo.
5. `#drawer-navigation > [data-drawer-nav]` produz exatamente seis controles na
   ordem `Persona`, `Personas`, `Memória`, `Permissões`, `Objetivo`, `Sessão`;
   `Fechar`, toggle externo, disclosures e controles internos não entram na
   seleção nem recebem o atributo. Sequências de clique provam a invariante
   zero-ou-um painel e `aria-expanded` correto.
6. Abrir foca o primeiro item; Tab/Shift+Tab ficam contidos; `Escape`, backdrop
   e `Fechar` fecham e devolvem foco ao toggle. Recarregar a fixture restaura
   drawer fechado, zero painel e zero disclosure aberto.
7. O HTML não contém `<hr>`. Os seletores de navegação, disclosure e evento de
   Sessão não usam `border-left`, `border-right` nem pseudo-elemento vertical.

## Progressive disclosure e conteúdo

8. Memória calcula os títulos exatamente pela regra de 72 pontos de código;
   testes cobrem texto curto, 72/73, CRLF, primeiras linhas vazias, Unicode fora
   do BMP e texto só de espaço. Clicar alterna um único detalhe com texto e
   metadados integrais e `Esquecer` chama o mesmo IPC uma vez.
9. Testes separados provam os contratos completos do Escopo 3: Persona inicia
   com `#status` recolhido sob `#persona-status-toggle`; Personas inicia com
   `#persona-form` recolhido, abre pelo único `Nova Persona`/`Editar` invocador e
   fecha em save verde/cancelar; Objetivo inicia sem toggle/resultado visíveis,
   abre em submit aceito e alterna sem perder conteúdo; Leitura/Escrita iniciam
   recolhidas nos respectivos containers. Todo controle mantém
   `aria-controls`, `aria-expanded` e `hidden` sincronizados e as guardas/IPC
   existentes intactos.
10. CSS garante rolagem vertical no drawer, wrapping de textos longos e fluxo
    normal dos painéis/detalhes; não há `position: absolute|fixed` nos painéis
    internos nem detalhe integral sob `overflow: hidden`.
11. Nenhum rótulo ou controle estático/dinâmico contém emoji. Testes cobrem ao
    menos menu, microfone nos três estados, TTS, hands-free ligado/desligado,
    Persona, Memória, Permissões, Objetivo e Sessão.

## Sessão e resposta

12. Todo evento usa uma tupla fechada do Escopo 4. Sucesso produz
    `user → tool* → assistant → memory*`; falha comum produz um erro; cancelamento
    confirmado produz um `system/cancelled` e zero erro duplicado.
13. Abertura/reabertura só publica evento após `chat.open()` resolver; rejeição
    preserva o histórico e acrescenta um único `error/session-failure`.
14. Selecionar um evento revela detalhe integral no painel Sessão. A regra de
    auto-scroll `<= 48` e o contador acima do limiar continuam cobertos nos dois
    lados da borda.
15. A tabela de resposta curta cobre 480/481 pontos de código, 4/5 linhas em
    LF/CRLF/CR, vazios consecutivos/finais e Unicode. `Ver resposta completa`
    abre drawer + Sessão + evento correto, mostra texto idêntico e faz zero
    chamada adicional a `window.atlas`.

## Núcleo volumétrico e estados

16. `#presence-core` contém um único `#presence-canvas`; `.core-orb`,
    `.core-halo`, Canvas adicional, SVG, WebGL, imagem/vídeo e recurso remoto não
    existem.
17. Testes determinísticos verificam 320 pontos de superfície + 80 internos,
    as quatro sentinelas e o SHA-256 canônico
    `e34bba11376031468c7b70c1a0e904eeed2871c0dc80d1485fd8368c7b3ecdb6`, além
    de ausência de `Math.random`, coordenadas limitadas à esfera, projeção 1:1,
    ordenação por profundidade e ponto frontal maior/mais opaco que seu par
    traseiro.
18. O contexto 2D registra somente partículas circulares preenchidas e glow;
    nenhum frame chama `lineTo`, `stroke` ou desenha órbita/trilho/anel/grade.
19. Resize respeita `devicePixelRatio <= 2`; `pointermove` altera yaw/pitch sem
    exceder ±12° e `pointerleave` converge à orientação neutra.
20. `data-state` assume somente os sete estados e a precedência do Escopo 7.
    Testes exercitam cada estado e conflitos em que `error` vence playback
    ativo e playback ativo vence `thinking`; `handsFreeState === 'speaking'`
    sem evento nativo de início não basta para produzir `speaking`.
21. Os sete perfis têm configurações distintas. Testes de mídia provam:
    `audio.play()`/IPC/criação do utterance não ativam fala; `playing` e
    `onstart` ativam; `ended`/`onend`, cancelamento e substituição encerram;
    falha Piper pré-início permanece `thinking` durante fallback; falha
    pós-início produz `speaking → thinking → speaking` somente após `onstart` do
    SO; falha final/término sem início nunca produz fala falsa. A onda tem ataque
    de 160 ms e release de 450 ms até zero, sem salto de posição.
22. Há uma única cadeia de `requestAnimationFrame`. Com reduced motion, ela é
    cancelada, eventos de ponteiro não animam, um frame estático continua
    volumétrico e o texto de todos os estados permanece correto.
23. Falha de `getContext('2d')` não derruba o boot, não cria alerta global e
    mantém Persona, estado, chat e controles acessíveis.

## Identidade, regressão e verificação

24. Tokens de destaque claro/escuro pertencem à família roxo-realeza; os tokens
    azul/ciano da v2.0 deixam de existir. Não há seletor manual de tema,
    `localStorage`, `sessionStorage`, URL remota ou dependência nova.
25. As suítes existentes de boot, Persona, Memória, Permissões, `ask`, chat,
    timeline, voz, paridade, hands-free, cancelamento e serialização permanecem
    verdes; os mesmos gestos permitidos continuam acionáveis.
26. `apps/desktop/tests/renderer.layout.test.ts` cobre os CAs 2–24 com dublês
    locais de Canvas/rAF/mídia; não exige display, GPU, microfone, Piper,
    Whisper ou Silero reais.
27. `pnpm --filter @atlas/desktop test` e `typecheck` passam; na raiz,
    `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm format:check` passam sem
    teste pulado.
28. O smoke visual humano da seção Observações é repetido no código v3.0 em
    janela real, incluindo **800 × 600 CSS px**, e todos os itens ficam `OK`.
    `Não executado`, `Não verificado` ou qualquer `FALHOU` bloqueia
    `Review → Done` e devolve a SPEC a `In Progress`.

---

# Arquivos Esperados

```text
apps/desktop/src/renderer/index.html
apps/desktop/src/renderer/styles.css
apps/desktop/src/renderer/renderer.js
apps/desktop/tests/renderer.layout.test.ts
docs/implementation/specs/SPEC-0053-desktop-visual-layout.md
```

Nenhum outro arquivo de produção é autorizado. Arquivos locais das tentativas
anteriores não constituem evidência de aceite e não ampliam este escopo.

---

# Componentes Impactados

- **Input Gateway** (`apps/desktop`): disposição e rótulos dos controles de
  texto/voz, sem mudar captura, normalização ou envio.
- **Output Gateway** (`apps/desktop`): núcleo, estado, resposta corrente,
  drawer, Sessão/timeline e apresentação de erros.

Persona Service, Memory Service, Permission Service, Core, Runtime e motores de
voz permanecem provedores consumidos por contratos existentes; não têm
responsabilidade alterada.

---

# Interfaces Necessárias

Nenhuma interface pública, porta, tipo, canal IPC ou contrato novo.

Convenções novas, todas internas ao renderer:

- `menu-toggle → panel-drawer → zero ou um painel`;
- disclosures efêmeros controlados por ARIA;
- `panel-session` como única casa da timeline local;
- point cloud determinística e perfil fechado dos sete estados;
- envoltória procedural de fala ligada ao estado `speaking` real.

---

# Fluxo Esperado

```text
Menu ──► drawer overlay ──► 0..1 painel
                            ├─ Persona
                            ├─ Personas
                            ├─ Memória
                            ├─ Permissões
                            ├─ Objetivo
                            └─ Sessão ──► timeline + detalhe

voz/texto ──► sinais já observados ──► data-state + perfil de partículas
                                              │
                                              ▼
                                  núcleo 3D central e acessível
                                              │
                                              ▼
                              resposta corrente + voz + composer

window.atlas.* → preload/IPC → main/Core permanece inalterado.
```

---

# Estratégia de Implementação

1. Tratar o código v2.0 como ponto mecânico de adaptação e remover primeiro as
   premissas rejeitadas dos testes: coluna fixa, timeline inferior e esfera CSS.
2. Fixar no teste o manifesto exato de 47 IDs HEAD + 30 IDs v3, a remoção dos
   artefatos v2, a nova árvore DOM, drawer, foco e Sessão.
3. Reorganizar o HTML sem tocar fiação de formulários/controles.
4. Implementar os contratos fechados de disclosure para Persona, Personas,
   Memória, Permissões e Objetivo em testes comportamentais antes de estilizar.
5. Mover a timeline para Sessão preservando o protocolo de eventos já validado;
   adaptar `Ver resposta completa` para abrir o drawer/painel/detalhe.
6. Implementar a point cloud determinística e travar sentinelas + digest antes
   de testar projeção/depth com contexto 2D dublado.
7. Ligar o mapa de perfis à origem única de estado; derivar playback real de
   `playing`/`onstart`, testar falhas/fallbacks e só então implementar a
   envoltória de fala e reduced motion sobre um único loop.
8. Aplicar a paleta roxo-realeza, remover emojis de rótulos/controles e validar
   layout/foco/wrapping.
9. Rodar suíte escopada e os quatro gates completos.
10. Entregar a janela real ao smoke humano; qualquer falha exige correção, nova
    validação e repetição integral do smoke.

---

# Estratégia de Testes

- **Estrutural:** HTML/CSS reais, igualdade de conjuntos do manifesto de 77 IDs,
  ausência dos artefatos v2, ordem, regiões, CSP, folha única e proibições de
  linha/órbita/recurso remoto.
- **Drawer/acessibilidade:** toggle, backdrop, Escape, foco inicial/retorno,
  contenção de foco, seleção exata por `data-drawer-nav`, exclusão de Fechar e
  controles internos, zero-ou-um painel e ARIA.
- **Disclosure:** títulos de Memória nas bordas Unicode/linhas, detalhe integral,
  um fato aberto; estados iniciais/transições de Persona, Personas, Objetivo e
  Leitura/Escrita; conteúdo primário sempre alcançável e fluxos preservados.
- **Sessão:** tuplas, ordem de turno, cancelamento único, reabertura assentada,
  seleção, detalhe, rolagem e abertura por resposta longa.
- **Canvas matemático:** sentinelas + SHA-256 canônico, superfície/interior,
  rotação, perspectiva, depth sort, raio/opacidade, resize e reação ao ponteiro.
- **Estado/movimento:** tabela de precedência, perfis distintos, loop único,
  `playing`/`onstart` como únicos inícios, terminais/cancelamento/substituição,
  falhas pré/pós-início e fallback, onda/retorno suave e reduced motion.
- **Regressão:** boot, painéis, chat, `ask`, STT, TTS, fallback, hands-free,
  cancelamento, paridade e serialização.
- **Humano:** composição, volume/profundidade, cor, movimento, legibilidade,
  foco e ausência de corte em display real.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os 28 Critérios de Aceitação estiverem atendidos;
- o teste estrutural provar os 77 IDs estáticos, a remoção dos artefatos v2 e a
  contagem de seis itens restrita a `data-drawer-nav`;
- os testes provarem estados iniciais e transições de todos os disclosures
  enumerados, digest/sentinelas dos 400 pontos e início/fim/fallback de playback
  nos eventos nativos definidos;
- testes escopados e os quatro comandos completos da raiz estiverem verdes;
- o smoke visual humano v3.0 estiver integralmente `OK` e registrado abaixo;
- nenhum arquivo fora do escopo autorizado tiver sido alterado pela
  implementação;
- Constituição, Module Catalog e ADRs 0019–0023 permanecerem preservados;
- a revisão estiver concluída;
- as lições aprendidas estiverem registradas em
  `docs/implementation/LESSONS_LEARNED.md`;
- o fechamento sincronizar as docs vivas aplicáveis, sem atribuir entrega às
  direções v1.x/v2.0 reprovadas.

---

# Restrições

1. Somente `index.html`, `styles.css` e `renderer.js` podem mudar em produção.
2. Core somente no main process; renderer sem import de `packages/*`, Node
   integration, canal IPC ou contrato novo.
3. CSP byte-idêntica; recursos locais; zero framework, asset ou dependência.
4. Os 47 IDs HEAD e os 30 IDs v3 são preservados; artefatos v2 rejeitados são
   removidos conforme o manifesto, sem IDs estruturais extras.
5. Drawer, painel, disclosure, timeline e visual do núcleo são efêmeros.
6. Canvas desenha partículas, nunca órbitas/linhas; estado vem só de sinais
   observados.
7. A onda de fala não lê áudio e não simula fidelidade de amplitude.
8. Reduced motion conserva informação textual e funcionalidade completa.
9. Conteúdo integral permanece alcançável; truncamento só com ação de revelar.
10. Smoke humano é gate bloqueante, não dívida transferível ao fechamento.

---

# Observações

- **Histórico vinculante:** a v2.0 chegou à implementação e validação técnica
  (1.322 testes/80 arquivos; gates raiz verdes), mas falhou no smoke humano por
  hierarquia, sobreposição/corte e falta de volume. Voltar a um requisito de
  sidebar/trilho/timeline permanente ou esfera plana contradiz esta v3.0.
- **Aprovação do conceito não é aprovação do código:** o usuário aprovou a
  visualização final de referência sem órbitas externas e autorizou seguir. O
  smoke abaixo ainda precisa avaliar a implementação real.
- **Por que não há ADR novo:** Canvas 2D e drawer são estratégias de
  apresentação internas aos Input/Output Gateways. Não criam módulo, contrato,
  dependência, persistência ou responsabilidade; ADR-0019 permanece intacto.
- **Por que Canvas 2D:** CSS-only falhou em comunicar profundidade; WebGL ou
  biblioteca gráfica aumentariam stack e manutenção. Projeção 3D em Canvas 2D
  é a menor solução que possui frente, fundo, volume e onda por partícula.
- **Por que a timeline continua local:** Sessão projeta somente dados já
  recebidos pelo renderer durante a sessão corrente. Não persiste nem assume a
  autoridade futura do Activity Service.
- **Por que a onda não usa amplitude:** a superfície atual só informa começo e
  fim do playback. Novo canal de áudio ampliaria IPC/contrato sem necessidade;
  a animação procedural ligada ao estado real entrega o efeito solicitado com
  transparência.

## Registro do smoke visual humano (CA 28)

Executor: usuário, em máquina com display real, depois da validação técnica e
antes do fechamento. Em `Draft`, todo item permanece legitimamente não
executado.

| # | Item | Resultado |
|---|---|---|
| 1 | em 800 × 600, o núcleo é o maior elemento e centro da tela; resposta/conversa e composer ficam imediatamente abaixo, sem corte | OK |
| 2 | menu inicia fechado, não reserva largura/altura e seu botão médio fica no canto superior esquerdo | OK |
| 3 | abrir o drawer sobrepõe sem deslocar o núcleo; fechar por botão, backdrop e Escape funciona | OK |
| 4 | a navegação mostra exatamente Persona, Personas, Memória, Permissões, Objetivo e Sessão; Fechar e ações internas são visualmente distintos e não parecem sétimo item | OK |
| 5 | painéis rolam sem sobrepor/cortar; disclosures de Persona, Personas, Memória, Permissões e Objetivo começam/abrem/fecham conforme o contrato e nunca ocultam conteúdo sem controle associado | OK |
| 6 | Sessão contém todo o histórico/timeline; não existe timeline inferior permanente | OK |
| 7 | paleta é roxo-realeza, sem destaque azul/ciano e sem emojis em rótulos/controles | OK |
| 8 | núcleo parece esfera/planeta de pontos, com frente, fundo, interior, rotação e reação de perspectiva perceptíveis | OK |
| 9 | nenhuma órbita, trilho, anel, grade ou linha externa circula a esfera | OK |
| 10 | listening, transcribing, thinking, speaking e error têm movimentos claramente distintos e texto correto | OK |
| 11 | a onda começa somente quando áudio Piper realmente toca ou a voz do SO realmente inicia; preparação/fallback silencioso não aparece como fala e término/cancelamento retorna suavemente ao estado seguinte | OK |
| 12 | reduced motion elimina movimento contínuo sem apagar esfera estática, texto de estado ou controles | OK |
| 13 | chat, resposta longa→Sessão, ask, Persona, Personas, Memória e Permissões continuam utilizáveis | OK |
| 14 | push-to-talk, TTS, hands-free, cancelamento e serialização preservam seus comportamentos | OK |
| 15 | navegação por teclado, foco do drawer e textos longos permanecem legíveis e alcançáveis | OK |

Qualquer `FALHOU` devolve a SPEC a `In Progress`, seguido de nova validação e
novo smoke completo. `Não verificado` não autoriza `Review → Done`.

---

# Checklist para IA

Antes de implementar:

- ler esta v3.0, ADRs 0019–0023, `apps/desktop/CLAUDE.md`, renderer e harness;
- tratar código v1.x/v2.0 como artefato local, não como autoridade;
- conferir o manifesto de 47 IDs HEAD + 30 IDs v3, os artefatos v2 removidos e
  os pontos atuais que escrevem estado, timeline e voz.

Durante implementação:

- manter origens únicas para drawer/painel, disclosure, estado e loop do núcleo;
- não tocar arquivo fora da lista autorizada;
- preservar fluxos/guardas e nunca inventar informação não observada;
- manter todo detalhe integral alcançável, `speaking` dependente de evento nativo
  de início e o Canvas estritamente decorativo.

Após implementação:

- rodar testes escopados e os quatro gates completos;
- revisar os 28 Critérios de Aceitação;
- entregar e registrar os 15 itens do smoke v3.0;
- somente após smoke verde seguir ao fechamento.

---

# Resultado Esperado

Ao abrir o desktop, o usuário encontra uma esfera holográfica de partículas que
gira como um planeta e comunica profundidade por frente, fundo, interior,
perspectiva e resposta ao ponteiro. Ela domina a tela sem órbitas ou linhas
externas. Quando o Atlas fala de verdade, seus próprios pontos ondulam e depois
retornam suavemente ao movimento estável. O texto continua dizendo claramente
se ele está pronto, ouvindo, transcrevendo, pensando, falando ou em erro.

Conversa corrente, voz e composer ficam logo abaixo. Configurações e histórico
não competem com a presença: um botão textual abre um drawer roxo-realeza com
seis áreas, e Sessão guarda a timeline completa. Detalhes aparecem sob demanda,
rolam dentro do painel e nunca ficam cortados ou sobrepostos.

Tudo permanece dentro do renderer atual: mesmos contratos, IPC, Core, voz,
permissões, memória e garantias de serialização; nenhuma dependência, rede ou
persistência visual nova.

---

# Decisões de design

Cada decisão abaixo está em formato de veto para o gate `Draft → Ready`.

**D1 — Perfil `completo`.**

- **Decisão:** seguir o pipeline completo.
- **Porquê:** a fatia vive em `apps/desktop`, reorganiza múltiplas superfícies e
  adiciona comportamento gráfico local; não satisfaz a localização conjuntiva
  de micro da Emenda v1.2.
- **Alternativa descartada:** `micro` por não tocar contratos; perdeu porque a
  ausência de contrato novo não basta para cumprir todas as condições.

**D2 — Prioridade `Medium`.**

- **Decisão:** manter prioridade `Medium`.
- **Porquê:** corrige qualidade central de experiência e transparência do PRD,
  mas não é falha de segurança nem bloqueio de capacidade do Core.
- **Alternativa descartada:** `High` pelo smoke reprovado; perdeu porque urgência
  de retrabalho não altera a criticidade de produto.

**D3 — Extensão de `Fase 2 — 2.1 Fundação da Interface`.**

- **Decisão:** atribuir a fatia à casca visual dos Input/Output Gateways.
- **Porquê:** Module Catalog e ADR-0019 já localizam interface, entrada e saída
  no app cliente; voz/conversa/gerência são capacidades preservadas.
- **Alternativa descartada:** reabrir 2.2/2.3/2.4; perdeu porque nenhum contrato
  ou comportamento dessas capacidades muda.

**D4 — v3.0 substitui integralmente as direções rejeitadas e volta a Draft.**

- **Decisão:** sidebar/trilho permanente, timeline inferior e esfera plana não
  sobrevivem; a versão passa por novo gate completo.
- **Porquê:** o smoke humano reprovou a implementação v2.0 apesar dos gates
  técnicos verdes, e o usuário aprovou explicitamente outra direção.
- **Alternativa descartada:** corrigir só CSS mantendo a hierarquia v2.0;
  perdeu porque preservaria as três causas da reprovação.

**D5 — Drawer overlay fechado por default, sem deslocar o núcleo.**

- **Decisão:** botão `Menu` 44 × 44 no canto superior esquerdo abre drawer com
  backdrop, foco contido e zero/ou-um painel; somente os seis filhos
  `data-drawer-nav` contam como navegação, nunca `Fechar` ou controles internos.
- **Porquê:** pedido explícito do usuário e critério de simplicidade do PRD;
  devolve o viewport ao protagonista sem remover gerência.
- **Alternativa descartada:** sidebar colapsável que ainda reserva coluna;
  perdeu porque o estado fechado continuaria alterando a geometria central.

**D6 — Sessão é a única casa da timeline.**

- **Decisão:** preservar protocolo/eventos/rolagem e mover a superfície inteira
  para o sexto painel, aberta sob demanda.
- **Porquê:** pedido explícito do usuário e Artigo 7; histórico continua
  consultável sem ocupar permanentemente a tela.
- **Alternativa descartada:** timeline inferior compacta; perdeu porque ainda
  reservaria altura e competiria com o núcleo.

**D7 — Progressive disclosure determinístico em fluxo normal.**

- **Decisão:** títulos de Memória usam regra 72/69+reticências e detalhes
  integrais; Persona recolhe status, Personas recolhe formulário, Permissões
  recolhe Leitura/Escrita e Objetivo recolhe resultado pelos controles/estados
  iniciais fechados no Escopo 3.
- **Porquê:** resolve sobreposição/corte observados no smoke com um padrão
  testável e acessível, preservando conteúdo integral.
- **Alternativa descartada:** truncar ou usar popover absoluto; perdeu porque
  esconderia informação ou repetiria a sobreposição reprovada.

**D8 — Canvas 2D nativo, não HTML/CSS-only nem WebGL.**

- **Decisão:** renderizar a esfera por projeção 3D de partículas em Canvas 2D.
- **Porquê:** CSS-only falhou no smoke; Canvas 2D é a menor tecnologia já
  disponível no Chromium que permite profundidade e deformação por ponto sem
  dependência nova, coerente com os Artigos 14/15.
- **Alternativa descartada:** WebGL/Three.js; perdeu pelo custo permanente de
  stack/teste para uma única visualização.

**D9 — Nuvem volumétrica determinística de 400 pontos, somente partículas.**

- **Decisão:** 320 pontos Fibonacci + 80 internos por `mulberry32(0x0a71a5)`,
  serialização canônica/digest SHA-256 e sentinelas fixadas, depth-sort,
  perspectiva e reação de ±12° ao ponteiro; nenhum traço linear.
- **Porquê:** frente/fundo/interior tornam o volume observável e reproduzível
  em testes; ausência de linhas implementa literalmente a aprovação final.
- **Alternativa descartada:** anéis/meridianos para sugerir esfera; perdeu
  porque o usuário os rejeitou mesmo após melhora visual.

**D10 — Sete perfis visuais sobre uma origem única de estado.**

- **Decisão:** manter a precedência validada e atribuir movimento distinto a
  `ready`, `booting`, `listening`, `transcribing`, `thinking`, `speaking` e
  `error` por mapa fechado; `speaking` exige `playbackActive` real.
- **Porquê:** usa apenas sinais reais já disponíveis, preserva transparência e
  torna os estados vivos sem novo IPC.
- **Alternativa descartada:** classes aplicadas por cada fluxo; perdeu por
  criar múltiplas fontes de verdade e conflitos de estado.

**D11 — Onda procedural dos pontos ligada ao `speaking` real.**

- **Decisão:** ativar fala/onda somente em `<audio>.playing` ou
  `SpeechSynthesisUtterance.onstart`; terminais, cancelamento, substituição e
  fallback seguem `pending/active` e amortecem a amplitude até zero em 450 ms.
- **Porquê:** pedido explícito aprovado pelo usuário; eventos nativos distinguem
  áudio real de preparação/fallback silencioso, mas não fornecem amplitude.
- **Alternativa descartada:** waveform fiel ou animação sempre ativa; perdeu
  por exigir nova superfície de áudio ou comunicar fala quando ela não ocorre.

**D12 — Reduced motion cancela movimento, não informação.**

- **Decisão:** um frame estático volumétrico por estado substitui rAF contínuo,
  com texto e interação intactos.
- **Porquê:** requisito explícito do usuário e acessibilidade; movimento é
  decorativo, estado textual é funcional.
- **Alternativa descartada:** ocultar Canvas ou manter rotação lenta; perdeu por
  apagar a identidade visual ou desrespeitar a preferência.

**D13 — Roxo-realeza sem persistência e sem emojis em controles.**

- **Decisão:** variantes do sistema preservam a família púrpura; controles usam
  texto simples, inclusive voz e hands-free.
- **Porquê:** direção visual explícita do usuário e Artigo 11; tema/disclosure
  não justificam estado persistente paralelo no renderer.
- **Alternativa descartada:** manter ciano/azul ou ícones emoji nativos;
  perdeu por contradizer a identidade aprovada e variar entre sistemas.

**D14 — Fronteiras e comportamentos existentes são invariantes.**

- **Decisão:** confinar produção aos três arquivos do renderer, preservar os 47
  IDs HEAD + 30 IDs v3, remover os artefatos v2 enumerados e manter IPC, voz,
  painéis, erros, cancelamento e serialização.
- **Porquê:** ADRs 0019–0023 e Module Catalog já atribuem as autoridades; esta é
  uma mudança de apresentação, não de domínio.
- **Alternativa descartada:** criar canal/módulo de animação ou amplitude;
  perdeu por ampliar arquitetura sem requisito funcional.

**D15 — Smoke humano v3.0 é bloqueante apesar da validação anterior.**

- **Decisão:** os 15 itens precisam de `OK` no código final antes de Done.
- **Porquê:** volume, hierarquia, corte e movimento não são demonstrados pelo
  jsdom; a própria v2.0 provou que gates técnicos verdes são insuficientes.
- **Alternativa descartada:** herdar a validação v2.0 ou a aprovação do
  protótipo; perdeu porque nenhum dos dois exercita a implementação v3.0 final.
