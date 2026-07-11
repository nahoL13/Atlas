# @atlas/cli

Interface de linha de comando do Atlas.

## Uso

```bash
atlas status        # sobe a plataforma, mostra estado e config, desliga
atlas --version     # versão
atlas --help        # ajuda
```

Overrides de configuração (precedência: flag > env > default):

- `--log-level <silent|error|info|debug>` · `ATLAS_LOG_LEVEL`
- `--data-dir <caminho>` · `ATLAS_DATA_DIR`

Durante o desenvolvimento, sem `dist/`:

```bash
node apps/cli/src/main.ts status
```
