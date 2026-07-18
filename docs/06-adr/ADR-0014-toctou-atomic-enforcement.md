# ADR-0014 — Fecho atômico de TOCTOU: enforcement de contenção no instante do uso

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-18

---

# Contexto

O [ADR-0013](ADR-0013-permission-service-execution-gate.md) estabeleceu o Permission Service como um **portão puro e síncrono**: `evaluate(action)` julga uma `ActionRequest` **antes** da execução, o Runtime aplica o veredicto, e a Tool só então toca o disco por uma porta injetável (`FsReadPort`/`FsWritePort`). A [SPEC-0015](../implementation/specs/SPEC-0015-permission-symlink-hardening.md) endureceu esse julgamento para operar sobre caminhos **reais** (`realpath` via `PathResolverPort`), fechando o escape por symlink **estático** — um link dentro de uma raiz apontando para fora dela deixa de escapar.

Resta uma limitação registrada explicitamente na atualização da SPEC-0015 no ADR-0013: **TOCTOU** (*Time-of-Check to Time-of-Use*). A resolução do caminho em `evaluate` e o uso subsequente pela Tool acontecem em **momentos distintos**, sobre uma **string de caminho**, não sobre um handle. Entre o `evaluate` (check) e o `open()` real da Tool (use), um symlink pode ser trocado para redirecionar o caminho para fora da raiz permitida — o check aprovou um alvo, mas a Tool opera sobre outro. A gravidade é maior na escrita e na deleção (clobber ou remoção de um arquivo fora do sandbox), mas vale também para a leitura (vazamento).

Este é o item **1.1 (Hardening) — TOCTOU** do [Roadmap](../04-engineering/Roadmap.md), marcado ali como `gate · SPEC direta`. Ao desenhar a solução, ficou claro que o fecho **real** (atômico) da janela exige mover parte da fronteira de segurança do pré-check puro para o **instante do uso** — o que **revisita** a decisão estrutural do ADR-0013 ("Permission Service = decisão pura antes da execução; Tool = IO"). Por isso este item foi reclassificado para `ADR primeiro`, e esta decisão é registrada como ADR próprio, não como nota de atualização do ADR-0013.

A pergunta central: **como fechar a janela TOCTOU sem que a Tool e o Permission Service passem a decidir contenção em dois lugares, e sem tornar `evaluate` assíncrono?**

---

# Decisão

**O check e o uso passam a compartilhar o mesmo file handle.** A garantia atômica só existe se a contenção for verificada sobre o recurso **realmente aberto**, não sobre uma string resolvida antes. Como Node não expõe `openat` por componente, o fecho mais forte e portável é: **abrir com `O_NOFOLLOW` + ancorar na identidade do fd**.

**A porta de IO abre o fd, coleta os fatos de uso, e aplica o veredicto sobre o fd.** As operações `FsReadPort.readFile`, `FsWritePort.writeFile` e `FsWritePort.appendFile` passam a executar, em sequência dentro de uma única invocação:

1. `open(path, flags | O_NOFOLLOW)` — o **componente final não pode ser um symlink** no instante do uso (senão `ELOOP`/`ENOTDIR` → recusa); Node expõe `O_NOFOLLOW` em `fs.constants`.
2. **Ancoragem na identidade do fd:** resolve `realpath(path)` e compara `fstat(fd)` (`dev`+`ino`) com `stat(realpath)`. Se divergirem, o alvo foi trocado entre abrir e verificar (**TOCTOU detectado**) → fecha o fd, recusa.
3. **Julgamento de contenção** do `realpath` de uso pelo Permission Service (puro/síncrono). Fora da raiz → fecha o fd, recusa.
4. Só então **opera sobre o fd** (lê/escreve pelo handle) e fecha.

**O Permission Service continua a única autoridade de decisão de contenção — agora julgando fatos de uso.** Ele ganha um método puro/síncrono adicional que julga um caminho **já canônico** (o `realpath` que a porta obteve e ancorou no fd), reusando a mesma lógica de contenção lexical (`within`) sobre as raízes já resolvidas. A porta **não** decide contenção; ela **coleta os fatos** (o realpath do fd) e **aplica** o veredicto — exatamente como o Runtime já aplica o veredicto de `evaluate`, mas no ponto onde o handle existe. Não há duplicação da autoridade de decisão: a política de raiz continua vivendo, inteira, no Permission Service.

**`evaluate` permanece intacto como pré-check, síncrono, defesa em profundidade.** Ele segue produzindo `blocked` (fora da raiz, óbvio antes de abrir) e `confirm` (`delete` destrutivo) — barreiras que precisam existir **antes** de qualquer `open()`. O fecho atômico é uma **segunda** barreira, no instante do uso, que só se aplica onde há um fd a segurar. `evaluate` **não** vira `Promise`; o Runtime **não muda** — segue chamando `permissions.evaluate` no pré-check e aguardando `tool.run`.

**A porta recebe um verificador estreito, não o serviço inteiro.** Para manter `@atlas/tools` acoplada apenas a `@atlas/contracts` (Regra 5), a porta recebe por injeção uma função estreita de verificação (`verify(realpath, access) → boolean`), fiada por `@atlas/core` a partir do método novo do Permission Service. A porta não conhece raízes nem o serviço concreto — só um predicado.

**Escopo do fecho atômico completo:** `read_file`, `write_file`, `append_file` (as operações que abrem-e-operam sobre um fd). `delete_file` (`unlink`) e `mkdir` **não** seguem o symlink do componente final por semântica POSIX — o residual delas é a troca de **ancestral**, documentado, não fechado nesta decisão. `list_dir` (`opendir`, sem flags de `O_NOFOLLOW` na API de alto nível) fica fora, com residual documentado.

---

# Consequências

Positivas:

- **A janela TOCTOU do componente final é fechada** para leitura e escrita: o recurso operado é comprovadamente o recurso verificado (mesma identidade `dev`+`ino` do fd), ou a operação é recusada.
- **A separação do ADR-0013 sobrevive.** O Permission Service continua a única autoridade de contenção (julga dado, puro/síncrono); a porta apenas coleta fatos de uso e aplica o veredicto sobre o fd. Nenhuma lógica de raiz migra para a Tool ou para a porta.
- **`evaluate` e o Runtime seguem inalterados** — pré-check síncrono, `confirm`/`blocked` como antes; nenhuma quebra de contrato em `@atlas/contracts` além do método novo de verificação de caminho canônico.
- **Falha estruturada, nunca exceção.** TOCTOU detectado ou contenção falha no instante do uso viram `ToolResult` de erro (mensagem distinta), registrados como `ExecutedStep` negado — o mesmo padrão de falha do ADR-0012/0013; a execução continua nos demais passos.
- **Defesa em profundidade:** duas barreiras (pré-check + fecho no fd) em vez de uma; um bug numa não abre a outra.

Custos e riscos:

- **Residual de troca de ancestral.** Node não expõe `openat` por componente; um diretório **ancestral** trocado na janela entre resolver o realpath e abrir o fd continua um risco teórico. Documentado como limitação remanescente — o gate cobre a lista atual de riscos, não é aberto. Fechá-lo exigiria walk por componente com `openat` (addon nativo) — fora de escopo.
- **`O_NOFOLLOW` é POSIX.** No Windows a flag não existe; o comportamento em Windows fica fora de escopo, consistente com a matriz de CI só-Linux adotada na [SPEC-0016](../implementation/specs/SPEC-0016-remote-and-ci.md).
- **Cobertura parcial das Tools de FS.** `delete_file`/`mkdir` ficam com o residual de ancestral (mitigado pela semântica POSIX do último hop); `list_dir` fica sem fecho atômico. São fatias futuras, não gates novos.
- **A porta passa a aplicar um veredicto**, não só a fazer IO cru. É uma ampliação deliberada do papel da porta (enforcement no ponto onde o handle existe), registrada aqui; a **decisão** de contenção permanece fora da porta.

---

# Alternativas Consideradas

**Manter tudo no pré-check e só estreitar a janela (reresolver o realpath imediatamente antes do `open`).** Barato e quase sem mudança arquitetural, mas **não fecha** a janela — apenas a encurta; o check e o uso continuam sobre momentos e objetos distintos. Rejeitada: não é honestamente um fecho, e o item é um gate de segurança.

**Só `O_NOFOLLOW` no `open`, sem ancorar na identidade do fd.** Impede o symlink no componente final, mas não detecta uma troca do próprio arquivo por outro (não-symlink) na janela. A comparação `fstat(fd)` × `stat(realpath)` custa pouco e fecha esse resíduo. Rejeitada como solução isolada; adotada em conjunto com a ancoragem.

**Utilitário "safe-open" compartilhado que centraliza open+contenção e devolve um handle verificado; Tools operam só sobre handles.** Centraliza a lógica atômica, mas **migra a contenção para fora do Permission Service** (parcialmente) e toca o `run()` de todas as Tools de FS. Rejeitada: fere a autoridade única de decisão do ADR-0013 e tem raio de mudança maior que o necessário.

**Portas conhecerem as raízes e checarem contenção elas mesmas.** Mais simples de fiar, mas passa a existir contenção **em dois lugares** (`evaluate` + portas) — duas fontes de verdade para a política de raiz. Rejeitada: duplica a autoridade de decisão; o predicado injetado estreito preserva a fonte única.

**Tornar `evaluate` assíncrono e mover a atomicidade para dentro dele.** `evaluate` não tem o fd (a porta o tem); moveria IO para o serviço e quebraria a invariante "Permission Service síncrono/sem IO na decisão" do ADR-0013/SPEC-0015. Rejeitada: a atomicidade tem de morar onde o handle existe — a porta —, não no julgador.

**Cobrir as seis Tools de FS numa fatia só (`delete`/`mkdir` com checagem de ancestral, `list_dir` com `O_DIRECTORY|O_NOFOLLOW`).** Cobertura total, mas vários caminhos de syscall distintos numa SPEC só — maior e mais arriscada. Rejeitada nesta fatia; `read`/`write`/`append` primeiro, o resto como residual documentado e candidato futuro.
