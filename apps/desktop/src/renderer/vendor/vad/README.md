# Recursos do VAD (SPEC-0052, ADR-0023)

Este diretório é o contrato de layout dos recursos do detector de voz (VAD)
consumidos pelo renderer (ponto único de criação em `src/renderer/renderer.js`,
`createHandsFreeDetector`) e por `apps/desktop/src/vad-resources.ts` — **nem o
runtime nem o modelo são versionados neste repositório**. O que está aqui é só
este `README.md`; `.gitignore` exclui todo o resto do diretório.

## Contrato pinado (SPEC-0052 — divergir é mudança de decisão arquitetural)

- **Modelo:** Silero VAD **v5**, arquivo `silero_vad.onnx` do release oficial
  `v5.1` (`snakers4/silero-vad`, MIT).
- **Runtime:** `onnxruntime-web` **v1.20.1**, build **wasm-only**,
  `numThreads = 1`, `proxy = false`.
- **Zero rede** em qualquer caminho, inclusive para runtime e modelo — nada é
  baixado em runtime pela app.

## Layout esperado (não é decisão arquitetural — SPEC-0052, "Layout do dist")

Nomes e quantidade de arquivos são derivados do pacote `onnxruntime-web`
pinado acima; o conjunto abaixo é o escolhido nesta implementação:

```text
apps/desktop/src/renderer/vendor/vad/
├── README.md          (este arquivo — o único versionado)
├── ort.min.js          (runtime onnxruntime-web — referenciado por UM <script> estático em index.html)
├── ort-wasm.wasm       (binário WASM do runtime — entregue ao renderer por ArrayBuffer via IPC)
└── silero_vad.onnx     (modelo Silero VAD v5 — entregue ao renderer por ArrayBuffer via IPC)
```

O `<script src="./vendor/vad/ort.min.js">` é a **única** forma de carregamento
do JS do runtime (sem bundler, ADR-0019, sem carregamento dinâmico — ponto 5
da cláusula de parada da SPEC-0052). Os dois binários (`ort-wasm.wasm`,
`silero_vad.onnx`) são lidos pelo main process (`vad-resources.ts`) e
entregues ao renderer via o canal IPC `'atlas:vad:resources'`, nunca por
`fetch`/XHR.

## Resolução do diretório

Sem override por env (D6 da SPEC-0052, diferente do Piper/whisper): o main
resolve sempre `apps/desktop/src/renderer/vendor/vad/` — irmão do documento do
renderer, o único caminho alcançável pelo `<script>` estático por URL relativa
sob `file://` sem bundler.

Nenhum download em runtime, nenhuma chamada de rede em nenhum caminho
(ADR-0023(f)): os três arquivos precisam já estar aqui antes de abrir a app,
senão o modo hands-free fica indisponível com o motivo visível no toggle.

Contrato completo — máquina de estados, constantes pinadas, contrato do grafo
de inferência, tabela de desfechos:
[SPEC-0052](../../../../../docs/implementation/specs/SPEC-0052-desktop-hands-free-voice-conversation.md),
seção *Contrato do detector, dos recursos e do laço*.

## Desvio observado ao popular os recursos pela 1ª vez (2026-08-06)

A distribuição "wasm-only" nomeada (`ort.wasm.min.js` do pacote npm
`onnxruntime-web@1.20.1`) **exige `import()` dinâmico** de um `.mjs`
companheiro (`ort-wasm-simd-threaded.mjs`) mesmo com `wasmBinary` fornecido —
confirmado empiricamente (`ERR_MODULE_NOT_FOUND`). Isso colide com o ponto 5
da cláusula de parada da SPEC-0052 (nenhum carregamento dinâmico de script).

`ort.min.js` deste diretório é hoje o conteúdo de `ort.bundle.min.mjs` (mesmo
pacote/versão) — embute a "cola" do Emscripten inline, sem `import()` em
runtime; testado ponta a ponta (sessão criada, inferência real rodada contra
`silero_vad.onnx`, formas batendo com o contrato pinado). Custo: é um ES
Module de verdade (`export{...}`), então precisa de um `<script
type="module">` para ser importado — e esse `<script>` **tem que ser
externo** (`src=`), nunca inline: a CSP de `index.html` é `script-src 'self'
'wasm-unsafe-eval'` (sem `'unsafe-inline'`), e o Chromium bloqueia em
silêncio um `<script type="module">` inline sob essa CSP (nenhum erro
visível — só `window.ort` nunca fica definido). Reproduzido na prática: o
toggle "hands-free" travava sem feedback nenhum na 1ª tentativa com um
`<script type="module">` inline. A ponte real é
`apps/desktop/src/renderer/vad-bootstrap.mjs` (rastreado no git, fora deste
diretório ignorado — é código autoral, não artefato binário), carregado por
`<script type="module" src="./vad-bootstrap.mjs"></script>` em `index.html`.
`ort-wasm.wasm` é `ort-wasm-simd-threaded.wasm` do mesmo pacote — sem par
não-threaded disponível nesta versão do onnxruntime-web; `numThreads=1`/
`proxy=false` (já fixados em `renderer.js`) evitam Worker/`SharedArrayBuffer`
em runtime.

**Não verificado como decisão formal** — é o registro do que foi preciso para
sair do estado "indisponível" na prática. Pendente: levar ao `spec-drafter`
para decidir se isso vira nota de implementação da SPEC-0052 ou exige ADR.
