# @atlas/core

Composition root da plataforma (ADR-0003) + Configuration Service + Lifecycle Manager.

- Único package autorizado a importar implementações de outros packages, exclusivamente para composição (Regra de Dependência 11).
- Não deve conter lógica de domínio — apenas wiring, ciclo de vida e configuração.
- Composição manual por factory functions (ADR-0004): dependências explícitas por parâmetro; sem container de DI.
- Estados de lifecycle e config são contrato público: mudanças exigem atualizar `@atlas/contracts` e verificar consumidores.
- Compõe `nodeReadlineConfirmPort()` como `ConfirmPort` default do Runtime (`@atlas/runtime`); `CreateAtlasDeps.confirm?` permite injetar um fake nos testes (sem terminal real). Registra `delete_file`/`mkdir`/`append_file` no `ToolRegistry` ao lado de `write_file` (SPEC-0013).
