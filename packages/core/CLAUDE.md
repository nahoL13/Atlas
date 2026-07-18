# @atlas/core

Composition root da plataforma (ADR-0003) + Configuration Service + Lifecycle Manager.

- Único package autorizado a importar implementações de outros packages, exclusivamente para composição (Regra de Dependência 11).
- Não deve conter lógica de domínio — apenas wiring, ciclo de vida e configuração.
- Composição manual por factory functions (ADR-0004): dependências explícitas por parâmetro; sem container de DI.
- Estados de lifecycle e config são contrato público: mudanças exigem atualizar `@atlas/contracts` e verificar consumidores.
- Compõe `nodeReadlineConfirmPort()` como `ConfirmPort` default do Runtime (`@atlas/runtime`); `CreateAtlasDeps.confirm?` permite injetar um fake nos testes (sem terminal real). Registra `delete_file`/`mkdir`/`append_file` no `ToolRegistry` ao lado de `write_file` (SPEC-0013).
- **Fecho atômico de TOCTOU (SPEC-0017):** `createAtlas` cria `permissions` **antes** das portas de FS default, e fia `permissions.isContained.bind(permissions)` como o `verify` injetado em `nodeFsReadPort({ verify })`/`nodeFsWritePort({ verify })` — as Tools de FS registradas (`read_file`/`write_file`/`append_file`) passam a operar com o fecho atômico ativo (O_NOFOLLOW + ancoragem de identidade do fd + veredicto de contenção no instante do uso). `CreateAtlasDeps.fsRead?`/`fsWrite?` seguem injetáveis nos testes (bypassam `nodeFsReadPort`/`nodeFsWritePort` por completo, então não exercitam essa fiação).
