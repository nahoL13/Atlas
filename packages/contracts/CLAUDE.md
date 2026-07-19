# @atlas/contracts

Contratos públicos compartilhados entre packages: tipos, interfaces e erros estruturados.

- **Nenhuma dependência** — nem de runtime, nem de outros packages.
- Runtime permitido: apenas classes de erro e constantes triviais (ex.: `LOG_LEVELS`).
- Um contrato só entra aqui quando um segundo package precisa dele; até lá vive no package dono (regra do Project Structure).
- Antes de alterar um contrato, verifique todos os consumidores: `git grep '@atlas/contracts'`.
- `AskResult` e `ConversationTurn` espelham-se deliberadamente (`text`/`reply` + `steps?: readonly ExecutedStep[]`, SPEC-0014; + `learned?: readonly string[]`, SPEC-0020): ao evoluir o resultado de um, avalie se o outro deve acompanhar.
- `Fact.source?: 'user' | 'learned'` e `MemoryService.remember(text, source?)` (SPEC-0020/ADR-0016): proveniência **opcional/aditiva** — distingue fato afirmado pelo usuário de fato proposto pelo Cognitive (Aprendizado). Default `'user'`; chamadores de 1 argumento seguem válidos. `learned?` carrega os candidatos **como dado** (o Cognitive não grava; a borda medeia).
- `ExecutedStep.denialKind?: 'blocked' | 'declined'` (SPEC-0019/ADR-0015): discriminador **opcional/aditivo** que distingue negação de política/consentimento de falha de Tool. Rotulado **só** pelo Runtime nos dois branches de negação; ausência = falha de Tool. É o dado que o observador do Cognitive lê para decidir replanejar — evita parsear a string `error` (Artigo 4). Manter opcional: código que constrói `ExecutedStep` sem ele segue válido.
