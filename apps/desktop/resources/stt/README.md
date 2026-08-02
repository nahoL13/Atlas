# Recursos do STT (SPEC-0046, ADR-0022)

Este diretório é o contrato de layout dos recursos do
[whisper.cpp](https://github.com/ggml-org/whisper.cpp) consumidos por
`apps/desktop/src/stt-engine.ts` — **nem o binário nem o modelo de
reconhecimento são versionados neste repositório**. O que está aqui é só este
`README.md`; `.gitignore` exclui todo o resto do diretório.

## Versão pinada

**`whisper-cli` v1.7.6** (Contrato da SPEC-0046). Qualquer divergência do
binário real frente ao contrato descrito abaixo é motivo de parar e devolver ao
`spec-drafter` — nunca de ajuste ad hoc no código.

> **O Homebrew não serve para este pin.** A fórmula `whisper-cpp` publica a
> série 1.9.x; instalar de lá entrega uma versão diferente da pinada. O
> procedimento verificado abaixo compila a tag exata a partir do fonte.

## Layout esperado

```text
apps/desktop/resources/stt/
├── README.md                     (este arquivo — o único versionado)
├── whisper-cli                   (binário, macOS/Linux — whisper-cli.exe no Windows)
└── models/
    └── ggml-small-q5_1.bin       (modelo único, ~181 MB)
```

Modelo **único** e em caminho fixo, por decisão da SPEC (D15): não há descoberta
de catálogo nem troca de modelo pela UI — voz de saída é preferência do usuário,
modelo de reconhecimento é trade-off técnico.

## Instalação em macOS arm64 (procedimento verificado)

Verificado na prática em 2026-08-01, macOS arm64 (Darwin 25.3.0).

**Compile estático.** O build default gera um executável que depende de seis
`.dylib` por `@rpath` (`libwhisper`, `libggml`, `libggml-cpu`, `libggml-blas`,
`libggml-metal`, `libggml-base`) — copiar só o executável para cá **não
funciona**, e trazer as libs junto contrariaria o layout de arquivo único acima.
`BUILD_SHARED_LIBS=OFF` resolve: o binário resultante só depende de frameworks
do sistema (Accelerate, Metal, MetalKit, Foundation, CoreFoundation, libc++,
libobjc, libSystem), nada de `@rpath`.

```sh
brew install cmake            # não vem por padrão

git clone --depth 1 --branch v1.7.6 https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp

cmake -B build -DCMAKE_BUILD_TYPE=Release \
      -DBUILD_SHARED_LIBS=OFF \
      -DWHISPER_BUILD_TESTS=OFF \
      -DWHISPER_BUILD_SERVER=OFF \
      -DGGML_METAL_EMBED_LIBRARY=ON
cmake --build build -j --config Release

cp build/bin/whisper-cli <este-diretório>/whisper-cli
chmod +x <este-diretório>/whisper-cli
otool -L <este-diretório>/whisper-cli   # não deve listar nenhum @rpath/…
```

`GGML_METAL_EMBED_LIBRARY=ON` embute os shaders Metal no próprio binário; sem
isso o `ggml-metal.metal` precisaria acompanhar o executável, quebrando o
layout de arquivo único.

Modelo — baixe para `models/`:

```sh
curl -L --fail -o models/ggml-small-q5_1.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin
```

## Smoke test (contrato de invocação da SPEC-0046)

Use o argv **exato** pinado na SPEC. O repositório do whisper.cpp traz
`samples/jfk.wav` (já em 16 kHz mono 16-bit), útil como entrada de teste:

```sh
./whisper-cli --model ./models/ggml-small-q5_1.bin \
              --file /caminho/para/samples/jfk.wav \
              --language pt --no-timestamps --no-prints --threads 4
```

Saída esperada: `exit 0` e a transcrição em **stdout**, sem timestamps e sem as
linhas de progresso do motor.

> **A saída começa com uma linha em branco.** É por isso que a normalização
> pinada na SPEC (descartar linhas vazias, juntar o resto com espaço simples,
> aplicar `trim`) não é opcional — verificado na prática.

> `--language pt` é **fixo** e força o português: rodar o smoke test sobre um
> áudio em inglês devolve uma tradução para o português, não um erro. Isso é
> comportamento esperado do Whisper com idioma forçado, não sintoma de
> instalação errada.

**Por que isto importa:** `isAvailable()` prova presença do *arquivo* do binário
e do modelo, **não** que o binário execute (mesma limitação conhecida de
`PiperTts.isAvailable()`). Um binário compilado dinâmico e copiado sem as
`.dylib` deixa o botão de microfone habilitado e toda transcrição falhando com
`engine-unavailable` — o sintoma não aponta para a instalação. Rode o smoke test
acima antes de concluir que há bug na app.

## Resolução do diretório (três níveis)

1. `ATLAS_STT_DIR` (variável de ambiente), se definida e não-vazia;
2. senão, `process.resourcesPath/stt`, quando a app está empacotada
   (`app.isPackaged === true` — empacotamento é Fase 3 do Roadmap);
3. senão (desenvolvimento), este próprio diretório —
   `apps/desktop/resources/stt`.

Nenhum download em runtime, nenhuma chamada de rede em nenhum caminho
(ADR-0022, garantia offline sem exceção): os assets precisam já estar aqui (ou
apontados por `ATLAS_STT_DIR`) antes de abrir a app.

## Contrato de invocação (Contrato da SPEC-0046)

- **argv**, sempre array, nunca shell:
  `['--model', '<sttDir>/models/ggml-small-q5_1.bin', '--file', '<tmpDir>/atlas-stt-<randomId>.wav', '--language', 'pt', '--no-timestamps', '--no-prints', '--threads', '4']`.
- **Nenhuma flag `--output-*`**: a transcrição é lida de stdout, não de arquivo.
- **Entrada**: WAV RIFF/PCM, 1 canal, 16 kHz, 16 bits assinado little-endian —
  cabeçalho montado no main process, caminho derivado só de `tmpDirProvider()` +
  `randomId()`, **nunca** de dado vindo do renderer.
- **Timeout**: `clamp(20 s + 5 × duração do áudio, 20 s, 180 s)`. Expirado (ou
  cancelado), o processo recebe `SIGTERM` e, se ainda vivo após 2 s, `SIGKILL`.
- O `.wav` temporário é removido em **todos** os desfechos que chegaram a
  escrevê-lo; falha de `unlink` nunca propaga.

Contrato completo, com os dez desfechos exaustivos, a validação da fronteira e a
justificativa de cada decisão:
[SPEC-0046](../../../../docs/implementation/specs/SPEC-0046-desktop-voice-input-stt.md),
seção *Contrato do binário e da fronteira*.
