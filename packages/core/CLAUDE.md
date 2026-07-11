# @atlas/core

Composition root da plataforma (ADR-0003) + Configuration Service + Lifecycle Manager.

- Único package autorizado a importar implementações de outros packages, exclusivamente para composição (Regra de Dependência 11).
- Não deve conter lógica de domínio — apenas wiring, ciclo de vida e configuração.
- Composição manual por factory functions (ADR-0004): dependências explícitas por parâmetro; sem container de DI.
- Estados de lifecycle e config são contrato público: mudanças exigem atualizar `@atlas/contracts` e verificar consumidores.
