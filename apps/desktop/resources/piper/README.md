# Recursos do Piper (SPEC-0040, ADR-0021)

Este diretório é o contrato de layout dos recursos do [Piper](https://github.com/rhasspy/piper)
consumidos por `apps/desktop/src/piper-tts.ts` — **nenhum binário nem modelo
de voz é versionado neste repositório** (Decisão D10). O que está aqui é só
este `README.md`; `.gitignore` exclui todo o resto do diretório.

## Versão pinada

**`rhasspy/piper` v1.2.0** — última release com binário nativo autocontido
(Decisão D4 da SPEC-0040). Qualquer divergência do binário real frente ao
contrato descrito abaixo é motivo de parar a implementação e devolver ao
`spec-drafter` (D4) — nunca de ajuste ad hoc no código.

> **A tag do GitHub `v1.2.0` não é onde mora o binário de todas as
> plataformas.** Ela publica **só** builds Linux (`piper_amd64`/`arm64`/
> `armv7`). Os binários macOS e Windows vivem na release seguinte,
> **`2023.11.14-2`** — nomenclatura diferente, mesma linha de código: o
> executável de lá se identifica como `1.2.0` em `piper --version`, e o
> contrato de invocação abaixo foi verificado na prática contra ele
> (2026-08-01, macOS arm64). O pin de D4 continua sendo **a versão do
> binário** (`1.2.0`), não o nome da tag.

## Layout esperado

```text
apps/desktop/resources/piper/
├── README.md              (este arquivo — o único versionado)
├── piper                  (binário, macOS/Linux — piper.exe no Windows)
├── libpiper_phonemize.*   (biblioteca compartilhada, nome varia por SO)
├── onnxruntime.*          (biblioteca compartilhada, nome varia por SO)
├── libespeak-ng.*         (biblioteca compartilhada, nome varia por SO)
├── espeak-ng-data/        (diretório de dados do espeak-ng)
└── voices/
    ├── pt_BR-faber-medium.onnx
    ├── pt_BR-faber-medium.onnx.json
    └── ...                (demais modelos PT-BR do catálogo)
```

O binário **precisa** dos arquivos/bibliotecas vizinhos no mesmo diretório
(`libpiper_phonemize`, `onnxruntime`, `espeak-ng-data/`) — mover só o
executável não funciona. Os pares de modelo `<id>.onnx`/`<id>.onnx.json`
ficam em `voices/`, resolvido como `modelsDir` por `piper-tts.ts`.

## Instalação em macOS arm64 (procedimento verificado)

O tarball macOS de `2023.11.14-2` **vem incompleto e não roda como sai da
caixa**. Duas armadilhas, ambas resolvidas *em disco* — nenhuma delas é
motivo de tocar em `src/`:

1. **As três `.dylib` não estão no pacote.** O tarball traz o diretório de
   símbolos `libonnxruntime.1.14.1.dylib.dSYM/` mas **não** a `.dylib` em
   si, nem `libespeak-ng.1.dylib`, nem `libpiper_phonemize.1.dylib`. Elas
   vivem no repo irmão
   [`rhasspy/piper-phonemize`](https://github.com/rhasspy/piper-phonemize),
   release **`2023.11.14-4`**, asset `piper-phonemize_macos_aarch64.tar.gz`,
   dentro de `lib/` — copie-as para **junto do binário** (este diretório).
2. **O executável sai sem nenhum `LC_RPATH`.** Ele procura as libs por
   `@rpath`, mas sem entrada de rpath o `dyld` só tenta `/usr/local/lib` e
   `/usr/lib` e aborta com `Library not loaded: @rpath/libespeak-ng.1.dylib`.
   Corrija adicionando o próprio diretório e re-assinando ad hoc (o
   `install_name_tool` invalida a assinatura existente):

```sh
install_name_tool -add_rpath @loader_path ./piper
codesign --force -s - ./piper
./piper --version   # deve imprimir: 1.2.0
```

Modelos: baixe o par `<id>.onnx` + `<id>.onnx.json` de
[`rhasspy/piper-voices`](https://huggingface.co/rhasspy/piper-voices)
(`pt/pt_BR/<dataset>/<quality>/`) para `voices/`.

Smoke test de ponta a ponta, no mesmo contrato de invocação de D4:

```sh
echo '{"text":"Bom dia.","output_file":"/tmp/smoke.wav"}' \
  | ./piper --model ./voices/pt_BR-faber-medium.onnx \
            --config ./voices/pt_BR-faber-medium.onnx.json --json-input
file /tmp/smoke.wav   # RIFF ... WAVE audio, 16 bit, mono 22050 Hz
```

> **Cuidado ao interpretar a saída:** as linhas `[piper] [info] …` saem por
> **stderr**; a **primeira linha de stdout** é o caminho do WAV — é ela, e
> só ela, o sinal de conclusão que `piper-tts.ts` consome (D4).

**Por que isto importa:** `isAvailable()` prova presença do *arquivo* do
binário + catálogo não-vazio, **não** que o binário execute (residual
conhecido, aceito na SPEC-0041). Um binário instalado sem as `.dylib` ou
sem rpath deixa a app em modo Piper-only com "Testar voz" **mudo** — o
sintoma não aponta para a instalação. Rode o smoke test acima antes de
concluir que há bug no app.

## Resolução do diretório (Decisão D10, três níveis)

1. `ATLAS_PIPER_DIR` (variável de ambiente), se definida e não-vazia;
2. senão, `process.resourcesPath/piper`, quando a app está empacotada
   (`app.isPackaged === true` — pipeline de empacotamento é Fase 3 do
   Roadmap, fora do escopo desta SPEC);
3. senão (desenvolvimento), este próprio diretório —
   `apps/desktop/resources/piper`.

Nenhum download em nenhum momento, nem em runtime nem por script desta
SPEC — os assets precisam já estar neste diretório (ou apontados por
`ATLAS_PIPER_DIR`) antes de abrir a app.

## Esquema real do `.onnx.json` (Decisão D13)

O topo do JSON publicado em `rhasspy/piper-voices` **não** tem uma chave
`name` nem `sampleRate` — os campos usados por `piper-tts.ts` vêm de
caminhos aninhados:

```json
{
  "audio": { "sample_rate": 22050, "quality": "medium" },
  "espeak": { "voice": "pt-br" },
  "language": { "code": "pt_BR", "family": "pt", "region": "BR" },
  "dataset": "faber",
  "piper_version": "1.0.0"
}
```

- `sampleRate` ← `audio.sample_rate`; ausente/não-numérico ⇒ derivado de
  `audio.quality` (`x_low`/`low` ⇒ `16000`, qualquer outro valor/ausência ⇒
  `22050`) — nunca motivo de omitir o modelo;
- `language` ← `language.code` → `espeak.voice` → prefixo do `id` até o
  primeiro `-`;
- `name` (rótulo de exibição) ← derivado de `dataset` + `language` +
  `audio.quality` (`"<dataset> (<language>, <quality>)"`); sem `dataset`, o
  próprio `id`;
- um modelo só é omitido do catálogo por par incompleto (`.onnx` sem
  `.onnx.json` irmão, ou o inverso) ou JSON inválido/não-objeto — nenhum
  outro campo ausente omite o modelo.

## Contrato de invocação (Decisão D4)

- **argv**, sempre array, nunca shell:
  `['--model', '<modelsDir>/<id>.onnx', '--config', '<modelsDir>/<id>.onnx.json', '--json-input']`.
- **stdin**: uma linha JSON compacta por utterance, terminada em `\n`:
  `{"text":"<texto normalizado>","output_file":"<caminho absoluto>"}` — só
  esses dois campos; texto com todo espaço em branco colapsado em espaços
  simples antes de serializar (framing é por linha).
- **Sinal de conclusão**: a primeira linha de stdout recebida após a
  submissão, sem parsear o conteúdo — o Piper ecoa o caminho do WAV
  escrito, mas o app não depende do formato desse eco.
- **Timeout**: 15 s por utterance. Expirado, o processo é encerrado e
  reciclado (não reusado) — mesma regra vale para cancelamento explícito.
- stderr é drenado e ignorado (nunca sinal de conclusão nem erro fatal).

Contrato completo, com justificativa e alternativas descartadas:
[SPEC-0040](../../../../docs/implementation/specs/SPEC-0040-desktop-piper-neural-tts.md),
Decisão D4/D13.

## Catálogo de vozes PT-BR

`pt_BR-faber-medium` é a voz default sugerida (Decisão D9 da SPEC-0040,
usada quando a Persona ativa não tem `voiceURI` escolhido). O catálogo
completo de vozes PT-BR publicadas é o de
[`rhasspy/piper-voices`](https://huggingface.co/rhasspy/piper-voices)
(diretório `pt/pt_BR/`) no momento do empacotamento — nenhuma allowlist fixa
de ids no código (Decisão D13): qualquer par `<id>.onnx`/`<id>.onnx.json`
colocado em `voices/` entra automaticamente no catálogo exposto pela app.
