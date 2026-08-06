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
