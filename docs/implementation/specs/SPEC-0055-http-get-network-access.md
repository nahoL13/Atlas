# Implementation Specification

> **Project Atlas — Implementation Specification**

Version: 1.2

---

# Informações Gerais

**ID**

SPEC-0055

---

**Título**

Primeiro acesso à internet **sob o portão de permissão**: Tool `http_get` somente-leitura em `@atlas/tools` sobre a porta injetável `HttpPort`, com o host julgado pelo portão de rede do Permission Service (`ResourceType: 'network'` + política `netRoots`, ADR-0026) e configurável pela CLI (`--allow-net` / `ATLAS_ALLOW_NET`)

---

**Status**

- [ ] Draft
- [ ] Ready
- [ ] In Progress
- [ ] Review
- [x] Done

---

**Prioridade**

- [ ] Critical
- [x] High
- [ ] Medium
- [ ] Low

Justificativa registrada nas "Decisões de design" (D2).

---

**Perfil**

- [ ] micro
- [x] completo

Justificativa registrada nas "Decisões de design" (D1).

---

**Item do Roadmap**

`Fase 1 — 1.4 Capacidades de Plataforma — Acesso à internet (Network Access Gate)` (`docs/04-engineering/Roadmap.md`, l. 105), marcado `candidato · SPEC direta` e apontando explicitamente para o [ADR-0026](../../06-adr/ADR-0026-network-access-gate.md) (`Accepted`, 2026-08-19): *"Primeira fatia candidata: Tool `http_get` somente-leitura em `@atlas/tools`."* Esta SPEC entrega exatamente essa primeira fatia. **Não** fecha o item 1.4 (seguem candidatas: execução de comandos sob o Permission Service, leitura de estrutura de projeto, Anthropic nativo, config por arquivo, Event Bus/Plugin Manager) e **não** fecha nem reabre nenhum critério de conclusão de fase — todos os `gate` da Fase 1 já estão entregues.

---

# Objetivo

Ao concluir esta SPEC, o **ciclo cognitivo** do Atlas passa a alcançar a internet **sob um portão explícito de permissão** — o primeiro acesso à rede julgado por `evaluate`.

Não é o primeiro egress do processo, e a SPEC não afirma isso: `@atlas/model-gateway` já fala com provedores remotos por `fetch` hoje (`packages/model-gateway/src/providers/remote.ts`, `providers/ollama.ts`), **sem** passar por `evaluate` nem por `netRoots`. O que é inédito aqui é uma **Tool**, escolhida pelo modelo, alcançar um host arbitrário — e ter esse host julgado pelo Permission Service antes de a requisição sair. A assimetria entre os dois caminhos fica registrada no residual 12.

Concretamente, deve existir:

1. **Uma Tool nova, `http_get`**, no Tool Registry: recebe `{ url }`, faz **uma** requisição `GET` e devolve ao ciclo cognitivo o status, o `content-type` e o texto da resposta. É um adaptador puro (Regra 5): declara como **dado** o que toca (`requirements(args) → { resource: { type: 'network', host }, access: 'read' }`) e não decide nada sobre permissão.
2. **Uma porta injetável `HttpPort`** (interna a `@atlas/tools`, molde de `FsReadPort`/`GitReadPort`), com adaptador default `nodeHttpPort()` sobre o `fetch` global do Node e um fake determinístico nos testes — nenhum teste toca a rede real.
3. **O portão de rede do Permission Service**, exatamente como o ADR-0026 decidiu: `ResourceType` ganha `'network'`, `ResourceRef` vira união discriminada (`'file'`/`'directory'` com `path`; `'network'` com `host`), e `evaluate` roteia por `resource.type`, julgando o host contra a política irmã `netRoots` por igualdade exata case-insensitive. `isContained` **não** ganha rota de rede (contrato FS-específico, ADR-0026(b)).
4. **Configuração fail-closed**: `netRoots` default `[]` — instalar o Atlas não abre host nenhum. Opt-in explícito por `--allow-net <host>` (repetível) ou `ATLAS_ALLOW_NET` (lista por vírgula), pela precedência do ADR-0006. `atlas status` passa a exibir a política de rede vigente.

Comportamento observável ao final:

```
$ atlas ask "resuma o conteúdo de https://example.com"          # sem --allow-net
… passo negado: host fora da lista permitida: example.com

$ atlas ask "resuma o conteúdo de https://example.com" --allow-net example.com
… a requisição acontece, o corpo volta ao modelo, e a resposta resume a página
```

Nenhum verbo além de `GET`; nenhum redirecionamento seguido automaticamente; nenhum cabeçalho customizado e **nenhum segredo do processo do Atlas** (API key do modelo, variáveis de ambiente, cookies, tokens) anexado à requisição pela porta.

**O que essa garantia não cobre.** `http_get` é uma Tool de **saída** de dados, não apenas de leitura: a URL inteira é composta pelo modelo, e o portão julga **somente o host** — nunca o caminho, nunca a query string, nunca o fragmento. `https://host-permitido/?d=<qualquer conteúdo do turno>` é um `GET` válido, permitido pelo portão, que envia dado do contexto para fora da máquina. A garantia desta fatia é, com precisão: **nenhum segredo do processo** sai. O que o modelo já tem no contexto — inclusive o que veio de um `read_file` sobre uma raiz já concedida — pode sair pela própria URL. Registrado como residual 10, conhecido e **não** fechado aqui.

---

# Motivação

O usuário pediu, em 2026-08-19, que o Atlas seja capaz de se conectar à internet. O **PRD** já sustenta o pedido em três lugares:

- *Requisitos Funcionais → Assistência*: **"O sistema deve realizar pesquisas."** — hoje sem nenhuma implementação: todas as Tools com efeito colateral entregues até a SPEC-0054 operam exclusivamente sobre o disco local.
- *Requisitos Funcionais → Execução*: **"O sistema deve integrar ferramentas externas quando necessário."**
- *Critérios de Aceitação do Produto*: **"utilizar ferramentas externas quando necessário."**

A exclusão do PRD em *Fora do Escopo Inicial* — *"integrações específicas que não possuam arquitetura definida"* — era o que travava a fatia, e foi **removida como obstáculo pelo ADR-0026**: a arquitetura passou a existir. O ADR foi aberto exatamente porque o `spec-drafter` escalou o pedido (Emenda v1.1, caso 3): um host não é um caminho e não tem "raiz" a conter, então a política necessária — allowlist de domínio — era um eixo de decisão inédito no Permission Service, com classe de ameaça sem análogo já decidido (SSRF, redirect para host não autorizado, exfiltração). O usuário aprovou o ADR, o fio principal o escreveu e aceitou, e o Roadmap registrou o candidato apontando para ele (l. 105).

Esta SPEC, portanto, **não decide arquitetura** — consome a que já foi decidida — e resolve o que o ADR-0026 explicitamente delegou às Observações: *"o contrato técnico exato da primeira Tool de rede (nome, assinatura, timeout, teto de tamanho de resposta, cabeçalhos permitidos/proibidos, porta injetável e seu fake de teste) é dado pela SPEC que a implementa"*.

O recorte é deliberadamente o mínimo defensável: **uma** Tool, **somente leitura**, **um** verbo, **sem** redirect, **sem** cabeçalho customizado, **sem** segredo repassado. É o mesmo critério de escopo mínimo com que a SPEC-0011 entregou o primeiro efeito colateral de disco (leitura antes de escrita, para exercitar o portão sem precisar do fluxo de confirmação) e com que a SPEC-0028 entregou as primeiras Tools de git (somente-leitura, subcomandos fixos, sem mutação).

Documentos originadores: **PRD** (Assistência/Execução/Critérios de Aceitação) + **[ADR-0026](../../06-adr/ADR-0026-network-access-gate.md)** (portão de rede) + **[ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md)** (Tools declaram `requirements` como dado; IO por porta injetável; Runtime aplica o veredicto) + **[ADR-0006](../../06-adr/ADR-0006-config-source-precedence.md)** (precedência `flags > env > defaults`; validação no core) + **Roadmap 1.4** (l. 105).

---

# Referências

- [PRD](../../02-product/ProductRequirementsDocument.md) — *Assistência* ("realizar pesquisas"), *Execução* ("integrar ferramentas externas"), *Critérios de Aceitação do Produto*, *Requisitos Não Funcionais* ("priorizar segurança"), *Fora do Escopo Inicial* (a exclusão que o ADR-0026 desbloqueia)
- [ADR-0026 — Network Access Gate](../../06-adr/ADR-0026-network-access-gate.md) — **fonte estrutural desta SPEC**: `ResourceType: 'network'`, `ResourceRef` como união discriminada, política `netRoots` (igualdade exata, case-insensitive, sem wildcard), default fail-closed, `--allow-net`/`ATLAS_ALLOW_NET` por vírgula, redirect não seguido (d), DNS/IP não validados (e), `isContained` sem rota de rede (b)
- [ADR-0013 — Permission Service: portão puro na execução](../../06-adr/ADR-0013-permission-service-execution-gate.md) — Tool descreve, serviço julga (puro/síncrono), Runtime aplica; *"o valor do portão está exatamente em julgar o recurso concreto"*; IO por porta injetável
- [ADR-0014 — Fecho atômico de TOCTOU](../../06-adr/ADR-0014-toctou-atomic-enforcement.md) — referenciado para **delimitar**: o predicado `verify`/`isContained` é FS-específico e **não** é estendido aqui (ver D4 e "Observações")
- [ADR-0012 — Planner/Runtime/Tools](../../06-adr/ADR-0012-planner-runtime-execution.md) — falha estruturada por passo, execução nunca lança
- [ADR-0006 — Precedência de fontes de configuração](../../06-adr/ADR-0006-config-source-precedence.md) — `flags > env > arquivo > defaults`; a CLI repassa valores crus, a validação vive no core
- [ADR-0007 — Promoção de contrato ao `@atlas/contracts`](../../06-adr/ADR-0007-model-gateway-contract-promotion.md) — critério do 2º consumidor real, aplicado ao placement de `HttpPort` (D5)
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — Permission Service (autoridade exclusiva de avaliação de permissão), Tool Registry, Regra 5 (Tools são adaptadores), *"componente que conceda permissões fora do Permission Service"* exige revisão arquitetural
- [Roadmap](../../04-engineering/Roadmap.md) — Fase 1, 1.4, l. 105
- SPECs de referência do mesmo padrão: [SPEC-0011](SPEC-0011-permission-service-fs-read.md) (1ª Tool com IO + portão), [SPEC-0012](SPEC-0012-write-file-tool.md) (política irmã com default vazio), [SPEC-0018](SPEC-0018-multiple-permission-roots-cli.md) (**molde exato** da borda de CLI: flag repetível + env por separador), [SPEC-0028](SPEC-0028-git-read-only-tools.md) (**molde exato** da porta com limites pinados como dado: argv fixo, teto de saída, truncagem sinalizada, transparência do alvo)

---

# Escopo

## 1. `@atlas/contracts` (`src/permission.ts`, `src/config.ts`)

Mudança **estrutural**, na forma exata decidida pelo ADR-0026(a):

```ts
export type ResourceType = 'file' | 'directory' | 'network';

export type ResourceRef =
  | { readonly type: 'file'; readonly path: string }
  | { readonly type: 'directory'; readonly path: string }
  | { readonly type: 'network'; readonly host: string };
```

- `AccessMode` **não muda** (`'read' | 'write' | 'delete'`): a Tool de rede usa `access: 'read'`.
- `ActionRequest`, `PermissionVerdict`, `PermissionDecision` **não mudam** de forma.
- `PermissionService.isContained(canonicalPath, access)` **não muda** — segue FS-específico (ADR-0026(b)); o comentário do membro passa a dizer isso explicitamente.
- `AtlasConfig.permissions` ganha `readonly netRoots: readonly string[]` (**obrigatório** na config resolvida, ao lado de `readRoots`/`writeRoots`); `AtlasConfigOverride.permissions` ganha `netRoots?: readonly string[]` (D12).

## 2. `@atlas/permissions` (`src/permission-service.ts`)

- `PermissionServiceDeps` ganha `netRoots?: readonly string[]` (opcional, default `[]` — D12).
- As `netRoots` são normalizadas **uma única vez, na criação** (mesmo momento em que `readRoots`/`writeRoots` são resolvidas por `realpath`): `trim()` + `toLowerCase()`, entradas vazias filtradas. **Nenhum IO** — hostname não se resolve por `realpath`.
- `evaluate` passa a **rotear primeiro por `resource.type`**:
  - `'file'` / `'directory'` → caminho existente **inalterado** (resolução por `PathResolverPort`, contenção lexical sobre `realpath`, rota por `access`).
  - `'network'` → `access !== 'read'` ⇒ `blocked` com motivo próprio; host normalizado vazio ⇒ `blocked` (`'host ausente ou não reconhecido'`); senão, igualdade exata contra `netRoots` ⇒ `allowed` | `blocked` (`host fora da lista permitida: <host>`). Nenhuma chamada ao `pathResolver` nesta rota.
- `evaluate` continua **puro e síncrono, sem IO**, e nunca lança.
- `isContained` **não é tocado** (nenhuma linha): segue julgando só `readRoots`/`writeRoots` sobre caminho canônico.

## 3. `@atlas/tools` — porta e Tool novas

**`src/http-port.ts` (novo)** — interna ao package (D5):

- `HttpResponse` — dado de resposta capturado (ver "Interfaces Necessárias").
- `HttpPort { get(url: string): Promise<HttpResponse> }`.
- `nodeHttpPort({ fetch?, timeoutMs? }): HttpPort` — adaptador default sobre `globalThis.fetch`, com:
  - init de requisição **exatamente** `{ method: 'GET', redirect: 'manual', signal }` — nenhuma outra chave, nenhum header (D6).
  - orçamento de tempo total por `AbortController` + timer, default `HTTP_TIMEOUT_MS = 10_000` (D7); abort ⇒ erro estruturado com mensagem própria; timer sempre limpo em `finally`.
  - leitura do corpo **incremental**, com teto `HTTP_BODY_LIMIT_BYTES = 65_536` (64 KiB): ao atingir o teto, o stream é cancelado, o texto é truncado, `HTTP_TRUNCATION_MARKER` é anexado e `truncated: true` (D8).
  - corpo **omitido** quando o `content-type` não é textual ou está ausente (`bodyOmitted: true`, D9) — o stream é cancelado sem leitura.
  - dos headers de resposta, só `content-type` e (em 3xx) `location` são capturados (D10). Nenhum outro header cruza a porta.
  - **guarda fail-closed de redirect opaco** (D18): se a resposta vier com `status === 0` ou `type === 'opaqueredirect'` — o desfecho que a spec WHATWG Fetch prescreve para `redirect: 'manual'` e que o undici do projeto **não** produz —, a porta lança `Error` com mensagem própria (destino do redirect não pôde ser revelado), **nunca** devolve uma `HttpResponse` de aparência normal com `status: 0`.
  - qualquer falha de transporte/decodificação vira `Error` com mensagem legível (a Tool a converte em `ToolResult` de erro).

**`src/http-get.ts` (novo)**:

- `createHttpGetTool({ http? }): Tool`, `name: 'http_get'`, `description` **pinada como dado** (texto exato em "Interfaces Necessárias", D19 — é a única superfície pela qual o Planner descobre e seleciona a Tool).
- Helper interno único `resolveHttpTarget(args): { url: string; host: string; error?: string }`, consumido **pelos dois** caminhos (D4): valida `args.url` (string não vazia), parseia com `new URL`, exige esquema `http:`/`https:`, recusa URL com credenciais embutidas (`username`/`password`, D11) e devolve `host` = `hostname` em minúsculas — `''` sempre que a URL for inutilizável por qualquer um desses motivos.
- O campo `url` devolvido pelo helper é **pinado**: é o `.href` do objeto `URL` já parseado (URL normalizada), **nunca** `args.url` cru (D4). É essa string — e só ela — que vai à porta e ao `output`; assim não existe nenhum diferencial de parser entre o que gerou o `host` julgado e o que o `fetch` vai requisitar. Com `error` presente, `url` é `''`.
- `requirements(args)` → **sempre** um `ActionRequest` (nunca `null`): `{ resource: { type: 'network', host }, access: 'read' }`.
- `run(args)`: `error` presente ⇒ `ToolResult` de erro **sem tocar a porta**; senão chama `http.get(url)` e monta o `output` na forma pinada (ver "Fluxo Esperado"), incluindo `url`, `status`, `content-type`, e — em 3xx — o `location` com a nota explícita de que o redirect **não** foi seguido.
- Qualquer resposta HTTP recebida ⇒ `{ ok: true, output }`, inclusive 3xx/4xx/5xx (D10); só validação de argumento e falha de transporte/timeout ⇒ `{ ok: false, error }`. **Nunca lança.**
- `src/index.ts` re-exporta `createHttpGetTool`, `nodeHttpPort` e os tipos/constantes públicos da porta.

## 4. `@atlas/core` (`src/index.ts`, `src/config/defaults.ts`, `src/config/load-config.ts`)

- `defaults.permissions` ganha `netRoots: []`.
- `loadConfig` merge `netRoots: override.permissions?.netRoots ?? defaults.permissions.netRoots` e **valida**: lista (pode ser vazia) de hostnames — string não vazia, sem espaço em branco, sem `://`, `/`, `@`, `:`, `?`, `#`. Falha ⇒ `issues` (mesmo molde das mensagens de `readRoots`/`writeRoots`).
- `createPermissionService({ readRoots, writeRoots, netRoots: config.permissions.netRoots })`.
- `CreateAtlasDeps` ganha `http?: HttpPort` (molde exato de `git?`/`fsRead?`); `const http = deps.http ?? nodeHttpPort()`; `registry.register(createHttpGetTool({ http }))`.
- Nenhuma outra mudança de wiring; nenhuma config nova além de `netRoots`.

## 5. `apps/cli` — borda de entrada (molde da SPEC-0018)

- `src/gateway/input-gateway.ts`: flag `'allow-net': { type: 'string', multiple: true }`; `CliValues` ganha `'allow-net'?: string[]`; `resolveRootList` é **generalizada com um parâmetro de separador** (`path.delimiter` para read/write; `','` para net) — uma única implementação de "flag repetível > env por separador, com `trim`, filtragem de vazios e colapso-para-vazio ⇒ não fornecida". `override.permissions` passa a ser montado quando **qualquer** das três listas tiver conteúdo.
- `src/run.ts`: `HELP_TEXT` documenta `--allow-net <host>` (repetível; default nenhum; `ATLAS_ALLOW_NET` aceita lista separada por **vírgula**, não por `path.delimiter`, porque hostname não é caminho).
- `src/commands/status.ts`: passa a imprimir `netRoots: <lista>` ou `(nenhum)` (D15), no mesmo formato de `writeRoots`.

## 6. Ajuste mecânico da união discriminada (3 sites)

`packages/runtime/src/confirm-port.ts`, `apps/cli/src/gateway/confirm-port.ts`, `apps/desktop/src/confirm-port.ts` formatam a mensagem de confirmação com `action.resource.path`, que deixa de compilar sobre a união. Cada um ganha um narrowing local de uma expressão (`resource.type === 'network' ? resource.host : resource.path`) — sem helper compartilhado (D16). Nenhuma mudança de comportamento: nesta fatia nenhum recurso de rede chega a produzir veredicto `confirm`.

## 7. Testes e documentação da SPEC

Testes unitários e de integração conforme "Estratégia de Testes". Documentação viva (`packages/tools/CLAUDE.md`, `packages/permissions/CLAUDE.md`, `packages/contracts/CLAUDE.md`, `packages/core/CLAUDE.md`, `apps/cli/CLAUDE.md`, `CLAUDE.md` raiz, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, nota no `Roadmap.md` l. 105) fica com o passo `doc-sync` de fecho; o `spec-implementer` toca só a documentação específica desta SPEC.

---

# Fora do Escopo

Esta seção é obrigatória.

- **Não** implementar qualquer verbo além de `GET` (`POST`/`PUT`/`PATCH`/`DELETE`/`HEAD`/`OPTIONS`). Método com efeito colateral exige desenho próprio de `access`/`confirm` e **reabriria o ADR-0026** — se a implementação achar que precisa, **pare e escale**.
- **Não** seguir redirecionamentos automaticamente. `redirect: 'manual'` é decisão do ADR-0026(d); implementar re-validação por hop é fatia futura com desenho próprio.
- **Não** implementar wildcard/sufixo de subdomínio em `netRoots` (`*.example.com`). O ADR-0026 rejeitou explicitamente nesta fatia.
- **Não** validar o IP resolvido (DNS rebinding, bloqueio de faixas privadas/loopback). Limitação registrada no ADR-0026(e); repetida em "Residuais conhecidos".
- **Não** estender `PermissionService.isContained` a `'network'` (ADR-0026(b)) nem criar um análogo de fecho atômico/`verify` para a porta HTTP — ver "Observações" (por que a rede não precisa da 2ª barreira que o git precisou).
- **Não** repassar cabeçalho, cookie, credencial, token, API key ou variável de ambiente do processo do Atlas ao host remoto; **não** aceitar cabeçalhos vindos do modelo/usuário nos `args`; **não** implementar autenticação, proxy, cache, `keep-alive` configurável, cookie jar ou retry. Essa proibição cobre o que a **porta anexa** à requisição — e **não** cobre o que a própria URL carrega: caminho e query string vêm do modelo e não são julgados por ninguém (residual 10). **Não** tentar fechar esse canal nesta fatia: restringir query string, validar o payload da URL ou criar um `AccessMode` de saída reabriria o ADR-0026 — se a implementação achar que precisa, **pare e escale**.
- **Não** persistir nada do que for baixado (nem corpo, nem cabeçalho, nem histórico de requisição) — o resultado vive no `ExecutedStep` do turno, como qualquer outra Tool. Memória só grava o que o laço de Aprendizado já grava hoje (ADR-0016).
- **Não** adicionar uma Tool de busca (`web_search`), scraping, parsing de HTML, extração de texto legível, ou qualquer interpretação do corpo: a Tool devolve o texto, o modelo interpreta (mesmo critério de `read_file` e da SPEC-0028/D6).
- **Não** tocar `@atlas/runtime` além do narrowing de uma expressão na mensagem do `ConfirmPort` (item 6 do Escopo): o portão já é agnóstico a `access`/`resource.type` desde o ADR-0013.
- **Não** tocar `@atlas/cognitive`, `@atlas/skills`, `@atlas/memory`, `@atlas/context`, `@atlas/persona`, `@atlas/model-gateway`.
- **Não** expor a política de rede na GUI (`apps/desktop`): o painel de permissões da SPEC-0038 continua com `readRoots`/`writeRoots` apenas. Consequência **consciente e fail-closed** registrada em "Residuais conhecidos" (D17).
- **Não** implementar seleção durável/persistência de `netRoots` (arquivo de config — slot `arquivo` do ADR-0006 segue não implementado).
- **Não** criar módulo, Skill ou Persona; **não** criar `AccessMode` novo; **não** criar Tool além de `http_get`.

---

# Residuais conhecidos (documentados, não fechados)

Registrados por exigência dos Artigos 1 e 7, no mesmo critério de residual documentado da SPEC-0028:

1. **DNS rebinding / IP resolvido não validado** — `evaluate` julga o hostname declarado, não o endereço para o qual ele resolve no instante da conexão (ADR-0026(e)). Um host permitido que resolve para um IP interno alcança esse IP.
2. **Redirect não seguido, mas também não re-julgado** — a resposta 3xx volta crua com o `location` visível (D10). Nada segue o destino automaticamente; se o usuário quiser o destino, precisa permitir aquele host e pedir a URL nova. Requisições que dependem de redirect (encurtadores, alguns endpoints) não completam nesta fatia.
3. **Sem wildcard de subdomínio** — `api.x.com` e `cdn.x.com` exigem duas entradas (ADR-0026, Custos e riscos).
4. **A concessão é por host, não por porta nem por caminho** — `ResourceRef` de rede carrega só `host` (ADR-0026(a)); permitir `example.com` permite qualquer porta e qualquer caminho daquele host, inclusive `http://` além de `https://`.
5. **Loopback/faixas privadas são alcançáveis se explicitamente listadas** — `--allow-net 127.0.0.1` permite falar com serviços locais (ex.: o próprio Ollama). É opt-in deliberado do usuário, não default; combinado com (1), é o principal vetor de SSRF residual.
6. **IDN/punycode e ponto final de FQDN** — o host derivado de `new URL` já vem em punycode (`xn--…`), enquanto uma `netRoot` digitada em Unicode não; e `example.com.` não é igual a `example.com` sob igualdade exata. Os dois casos falham **fechados** (bloqueiam), nunca abrem. Normalizá-los é candidato futuro (D13).
7. **IPv6 literal não é aceito em `netRoots`** — a validação do core rejeita `:` no host, o que exclui `[::1]`/endereços literais IPv6. Fail-closed, candidato futuro.
8. **Rede de *Tools* indisponível na GUI** — `apps/desktop` não configura `netRoots`, logo um Core aberto pela janela sempre tem `netRoots: []` e `http_get` sempre bloqueia ali (D17). A ausência vale para **Tools**: o Model Gateway da janela continua falando com o provedor remoto normalmente (residual 12), como já faz desde a SPEC-0031 — a GUI não fica offline, só não ganha a capacidade nova. Nenhuma regressão; capacidade simplesmente não exposta.
9. **Sem observabilidade dedicada de rede** — nenhuma métrica, log ou contador de requisições; o rastro é o `ExecutedStep` do turno, como em qualquer Tool. O painel `Sistema` (SPEC-0054) mede rede **do host**, não requisições do Atlas.
10. **A URL é um canal de saída de dados, e o portão não o julga** — este é o **primeiro caminho de exfiltração da plataforma**, e ele fica aberto. `http_get` não é só leitura: a URL inteira é composta pelo modelo e o portão avalia **apenas o host**. Com `--allow-net exemplo.com` concedido, `https://exemplo.com/coleta?d=<qualquer texto do contexto>` é um `GET` legítimo, permitido, que envia esse texto para fora — e o `output` da Tool não revela nada de anormal, porque nada anormal aconteceu do ponto de vista do portão. Combinado com um `--allow-read` já concedido (a combinação realista: o usuário liga leitura de disco e liga um host), o caminho completo "ler arquivo local → embutir na query string → requisitar host permitido" está disponível para o modelo sem nenhuma barreira adicional. O que **contém** o risco hoje é apenas o fail-closed do host: sem `--allow-net`, nada sai; com ele, sai para aquele host, escolhido pelo usuário. O que **não** contém: nada limita o tamanho, o formato ou o conteúdo da URL requisitada, e o `ConfirmPort` não é acionado (rede produz só `allowed`/`blocked`, D10/D16). Fechar isso exigiria decisão estrutural nova (restrição de query string, `AccessMode` de saída, ou confirmação por requisição) — **reabriria o ADR-0026** e é candidato a ADR próprio, não a esta SPEC.
11. **Injeção indireta de prompt pelo corpo remoto** — é a **primeira vez** que texto de terceiro não confiável influencia a decisão do modelo. O corpo da resposta (até 64 KiB, D8) entra no prompt da 2ª chamada de composição e, quando há replanejamento (ADR-0015, teto de 1), também no prompt de **planejamento** — ou seja, uma página pode conter instruções que o Planner leia como objetivo. Os portões existentes contêm parte disso e não tudo. **Contêm**: nenhuma Tool de disco alcança fora de `readRoots`/`writeRoots`; `write_file`/`append_file`/`mkdir` são inertes com `writeRoots` vazio (default); `delete_file` exige `confirm` humano (ADR-0013); nenhum host fora de `netRoots` é alcançável; e o teto de 1 replanejamento limita a quantos passos a injeção pode encadear num turno. **Não contêm**: um segundo `http_get` para um host **já permitido** (inclusive o mesmo que serviu o texto malicioso) é `allowed` sem novo gesto do usuário — o que combina diretamente com o residual 10; e nada governa o **texto da resposta final** ao usuário, então uma página pode induzir o Atlas a afirmar algo falso, recomendar um comando, ou pedir ao usuário que conceda uma raiz nova. Mitigação por desenho de prompt (delimitar/rotular conteúdo remoto como não confiável) é candidata de fatia futura; nesta fatia o corpo entra no prompt sem marcação especial.
12. **Assimetria: `@atlas/model-gateway` faz egress sem portão** — os providers `remote` e `ollama` chamam `globalThis.fetch` diretamente (`packages/model-gateway/src/providers/remote.ts`, `providers/ollama.ts`) e **não** passam por `evaluate` nem consultam `netRoots`; esta SPEC não os toca (diff vazio exigido nos Critérios de Aceitação). Consequência: `netRoots: []` **não** significa "o processo Atlas não fala com a rede" — significa "nenhuma **Tool** alcança a rede". Levar o Model Gateway para dentro do portão é decisão estrutural própria (o endpoint do provedor é infraestrutura configurada pelo usuário, não recurso escolhido pelo modelo) e fica fora do escopo desta SPEC.
13. **Windows** fora de escopo, consistente com a matriz de CI só-Linux (SPEC-0016).

---

# Pré-requisitos

Status conferido no arquivo de cada SPEC:

- [SPEC-0010](SPEC-0010-planner-runtime-tools.md) (Planner + Runtime + Tools + Tool Registry) — **Done**.
- [SPEC-0011](SPEC-0011-permission-service-fs-read.md) (Permission Service + `requirements` como dado + porta de IO injetável) — **Done**.
- [SPEC-0018](SPEC-0018-multiple-permission-roots-cli.md) (flag repetível + env por separador na borda da CLI — molde reusado) — **Done**.
- [SPEC-0028](SPEC-0028-git-read-only-tools.md) (porta com limites pinados como dado, truncagem sinalizada, transparência do alvo — molde reusado) — **Done**.

Pré-requisito documental: **[ADR-0026](../../06-adr/ADR-0026-network-access-gate.md)** com `Status: Accepted` (confirmado, 2026-08-19).

---

# Critérios de Aceitação

Cada item é verificável mecanicamente.

**Contratos (`@atlas/contracts`)**

- `ResourceType` inclui `'network'`; `ResourceRef` é união discriminada — `{ type: 'network', host }` compila e `{ type: 'network', path }` **não** compila (teste de tipo negativo via `@ts-expect-error`).
- `AccessMode` permanece `'read' | 'write' | 'delete'` (nenhum modo novo — asserção de tipo).
- `AtlasConfig.permissions.netRoots` existe e é obrigatório; `AtlasConfigOverride.permissions.netRoots` existe e é opcional.
- A assinatura de `PermissionService.isContained` é idêntica à atual (diff limitado a comentário).

**Portão de rede (`@atlas/permissions`)**

- `createPermissionService({ readRoots, writeRoots })` **sem** `netRoots` ⇒ toda ação `network` é `blocked` (fail-closed por omissão).
- `netRoots: []` ⇒ `blocked` para qualquer host.
- `netRoots: ['example.com']`: `{ type: 'network', host: 'example.com' }, access: 'read'` ⇒ `allowed`; `'EXAMPLE.COM'` e `'  example.com  '` ⇒ `allowed` (normalização nos dois lados); `'sub.example.com'` ⇒ `blocked`; `'example.com.evil.com'` ⇒ `blocked`; `'xample.com'` ⇒ `blocked`.
- `host: ''` (ou só espaços) ⇒ `blocked` com motivo próprio (`host ausente ou não reconhecido`), mesmo com `netRoots` não vazia.
- `access: 'write'` ou `'delete'` sobre `type: 'network'` ⇒ `blocked` com motivo próprio, independentemente de `netRoots`.
- Uma avaliação de rede **não** consulta o `PathResolverPort` (spy no fake: zero chamadas).
- `evaluate` sobre `'file'`/`'directory'` mantém **exatamente** o comportamento atual — a suíte existente de `permission-service.test.ts` passa sem alteração de expectativa.
- `isContained('/qualquer', 'read')` continua julgando só FS; não existe sobrecarga/rota de rede (asserção de diff: `isContained` inalterado).

**Porta `HttpPort` (`nodeHttpPort`, com `fetch` fake)**

- O init passado ao `fetch` tem **exatamente** as chaves `method`, `redirect`, `signal` — asserção exaustiva sobre `Object.keys(init).sort()`; `method === 'GET'`; `redirect === 'manual'`.
- O init **não** tem `headers`, `body`, `credentials`, `referrer`, `cache` (decorrência da asserção acima, asserida também de forma explícita e nomeada).
- Nenhum valor de `process.env` aparece na URL nem no init (asserção: as únicas strings passadas ao fake são a URL do teste).
- Resposta `302` com `location` ⇒ o fake é chamado **uma única vez** (nenhuma segunda requisição), `status === 302`, `location` capturado.
- **Guarda fail-closed de redirect opaco (D18)**: um `fetch` fake que devolve a *opaque-redirect filtered response* da spec WHATWG (`status: 0`, headers sem `location`) ⇒ a porta **rejeita** com `Error` de mensagem própria; idem para `response.type === 'opaqueredirect'`. Em nenhum dos dois casos existe caminho que produza `HttpResponse` com `status: 0`, e a Tool sobre esse fake devolve `{ ok: false, error }` — **nunca** `ok: true` travestindo status 0 de resposta normal.
- Corpo textual maior que 64 KiB ⇒ `truncated === true`, `body.length` ≤ 64 KiB + marcador, marcador presente no texto, e o stream é cancelado (spy em `cancel()` do reader).
- Corpo textual menor que o teto ⇒ `truncated === false`, texto íntegro.
- `content-type: image/png` (e ausência total de `content-type`) ⇒ `bodyOmitted === true`, `body === ''`, sem leitura do stream.
- `content-type: application/json`, `text/plain`, `text/html; charset=utf-8`, `application/xhtml+xml` ⇒ corpo lido normalmente (`bodyOmitted === false`).
- `fetch` que nunca resolve + relógio/timer controlado ⇒ a promessa rejeita após `HTTP_TIMEOUT_MS`, o `AbortController` foi acionado (spy no `signal.aborted`), e o timer é limpo.
- `fetch` que rejeita (falha de DNS/conexão) ⇒ `Error` com mensagem legível, nunca rejeição opaca.

**Tool `http_get`**

- `requirements({ url: 'https://Example.COM/a/b?q=1' })` ⇒ `{ resource: { type: 'network', host: 'example.com' }, access: 'read' }`.
- `requirements` **nunca** devolve `null`/`undefined` — nem para `args` vazio, `url` não-string, URL inválida, esquema `file:`/`ftp:`, ou URL com credenciais: nesses casos devolve host `''` (que o `evaluate` bloqueia).
- `requirements` e `run` derivam host/URL pelo **mesmo helper** (asserção: para a mesma entrada, o host declarado é o hostname da URL passada à porta — verificável por spy na porta fake).
- **`resolveHttpTarget.url` é o `.href` normalizado, não a string crua**: para `args.url = 'HTTPS://Example.COM:443/a/../b?q=1#frag'`, o helper devolve `url === new URL(args.url).href` e a string passada à porta (spy) é **idêntica** a esse `href` — não a `args.url`. Idem para uma entrada já normalizada (`href` estável, sem alteração). `error` presente ⇒ `url === ''` e a porta não é chamada.
- `Tool.description` de `http_get` é **exatamente** a string pinada em "Interfaces Necessárias" (asserção de igualdade), e contém `GET`, a nota de redirect não seguido, os limites de corpo e a exigência de host permitido.
- `run` com URL inválida / esquema não-http(s) / credenciais embutidas ⇒ `{ ok: false, error }` **sem** chamar a porta (spy: zero chamadas).
- `run` bem-sucedido ⇒ `{ ok: true, output }` contendo a URL requisitada, `status:` e `content-type:` antes do corpo.
- `run` sobre resposta `301/302/307/308` ⇒ `ok: true`, `output` contém o `location` **e** a frase pinada de que o redirect não foi seguido.
- `run` sobre `404`/`500` ⇒ `ok: true` com o status no `output` (não é falha de Tool).
- Porta que lança (timeout, DNS) ⇒ `{ ok: false, error }`, **nunca** lança.
- `http_get` não consulta `permissions` em nenhum caminho (asserção estrutural: `@atlas/tools` não importa `@atlas/permissions`).

**Integração (`@atlas/core` + Runtime)**

- `createAtlas` registra `http_get` no Tool Registry.
- Com `permissions.netRoots: []` e um plano que usa `http_get`, o passo vira `ExecutedStep` negado (`denialKind: 'blocked'`), a porta HTTP **não** é chamada (spy) e a execução não lança.
- Com `netRoots: ['example.com']` e porta fake, `atlas.cognitive.ask` produz `steps` com sucesso e o corpo devolvido chega à composição.
- Host **fora** de `netRoots` ⇒ passo negado com o motivo contendo o host.
- `@atlas/runtime` não recebe nenhuma mudança de fluxo (diff restrito à expressão de formatação do `ConfirmPort`).

**Configuração e CLI**

- `defaultConfig().permissions.netRoots` é `[]`.
- `loadConfig({})` resolve `netRoots: []`; `loadConfig({ permissions: { netRoots: ['a.com','b.com'] } })` chega intacto e sem `issues`.
- `loadConfig` rejeita com `issue` dedicada: `['https://a.com']`, `['a.com/x']`, `['a.com:443']`, `['user@a.com']`, `['']`, `['  ']`, `['a b.com']`, valor não-array.
- `normalize(['status','--allow-net','a.com','--allow-net','b.com'], {})` ⇒ `permissions.netRoots = ['a.com','b.com']` (ordem preservada).
- `ATLAS_ALLOW_NET='a.com,b.com'` ⇒ `['a.com','b.com']`; `'a.com, b.com,'` ⇒ `['a.com','b.com']` (trim + filtragem); `''` e `','` ⇒ `permissions.netRoots` **não** é setado (cai no default).
- Flag presente + env presente ⇒ a flag **substitui** por inteiro (sem merge), como em `--allow-read`.
- `ATLAS_ALLOW_NET` **não** é dividido por `path.delimiter`: `'a.com:b.com'` produz uma única entrada `'a.com:b.com'`, que o `loadConfig` rejeita com `issue` (comportamento honesto e verificável).
- `--allow-read`/`--allow-write`/`ATLAS_ALLOW_READ`/`ATLAS_ALLOW_WRITE` mantêm exatamente o comportamento da SPEC-0018 (suíte existente verde, sem alteração de expectativa).
- `atlas status` imprime `netRoots: a.com, b.com` e `netRoots: (nenhum)` quando vazia.
- `HELP_TEXT` documenta `--allow-net` como repetível e a env por vírgula.

**Invariantes globais**

- Nenhuma dependência de runtime nova em nenhum `package.json` (o `fetch` global do Node basta).
- Nenhum teste faz requisição de rede real (asserção por revisão + fakes obrigatórios em todos os casos).
- Diff **vazio** em `@atlas/cognitive`, `@atlas/skills`, `@atlas/memory`, `@atlas/context`, `@atlas/persona`, `@atlas/model-gateway`, `apps/desktop/src/renderer/*`.
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes na raiz.
- Lições registradas em `docs/implementation/LESSONS_LEARNED.md`; docs vivas sincronizadas no `doc-sync` de fecho.

---

# Arquivos Esperados

```text
packages/contracts/src/
  permission.ts        # editado: ResourceType + 'network'; ResourceRef união discriminada
  config.ts            # editado: permissions.netRoots (AtlasConfig + AtlasConfigOverride)

packages/permissions/src/
  permission-service.ts  # editado: netRoots normalizadas na criação; evaluate roteia por resource.type
packages/permissions/tests/
  permission-service.test.ts  # editado: bateria de rede (allow/block/normalização/access inválido/sem pathResolver)

packages/tools/src/
  http-port.ts         # novo: HttpResponse, HttpPort, nodeHttpPort, constantes de limite
  http-get.ts          # novo: createHttpGetTool + resolveHttpTarget (helper único)
  index.ts             # editado: re-exports
packages/tools/tests/
  http-port.test.ts    # novo: init exaustivo, redirect manual, truncagem, corpo não textual, timeout
  http-get.test.ts     # novo: requirements/run, erros estruturados, 3xx/4xx/5xx, porta não tocada

packages/core/src/
  config/defaults.ts   # editado: netRoots: []
  config/load-config.ts# editado: merge + validação de hostname
  index.ts             # editado: netRoots no PermissionService; nodeHttpPort; registra http_get; deps.http?
packages/core/tests/
  load-config.test.ts  # editado: merge/validação de netRoots
  create-atlas.test.ts # editado: registro de http_get; integração bloqueado × permitido

packages/runtime/src/confirm-port.ts     # editado: narrowing de ResourceRef na mensagem
apps/cli/src/gateway/confirm-port.ts     # editado: idem
apps/desktop/src/confirm-port.ts         # editado: idem

apps/cli/src/gateway/input-gateway.ts    # editado: --allow-net; resolveRootList com separador
apps/cli/src/run.ts                      # editado: HELP_TEXT
apps/cli/src/commands/status.ts          # editado: netRoots
apps/cli/tests/input-gateway.test.ts     # editado: bateria de --allow-net / ATLAS_ALLOW_NET
apps/cli/tests/status.test.ts            # editado: netRoots no output + fake de AtlasConfig
```

Lista é expectativa; ajustes pequenos são aceitáveis (ex.: um helper interno compartilhado de normalização de host dentro de `@atlas/permissions`).

---

# Componentes Impactados

- **Contracts (`@atlas/contracts`)** — `ResourceType`/`ResourceRef` (mudança estrutural, ADR-0026(a)); `AtlasConfig`/`AtlasConfigOverride` (`netRoots`).
- **Permission Service (`@atlas/permissions`)** — política irmã `netRoots` e roteamento por `resource.type` em `evaluate`; `isContained` intacto.
- **Tools (`@atlas/tools`)** — Tool `http_get` + porta `HttpPort` (primeiro IO de rede do package).
- **Core (`@atlas/core`)** — default, validação, wiring da política e da porta, registro da Tool.
- **CLI (`@atlas/cli`)** — borda de entrada (`--allow-net`/`ATLAS_ALLOW_NET`), `--help`, `atlas status`.
- **Runtime (`@atlas/runtime`)** — **sem mudança de fluxo**: já aplica qualquer veredicto sobre qualquer `resource.type` desde o ADR-0013; só a string de confirmação é ajustada à união.
- **Desktop (`apps/desktop`)** — apenas o ajuste de narrowing no `ConfirmPort`; nenhuma capacidade de rede exposta na GUI (D17).
- **Planner / Cognitive Core / Model Gateway / Memory / Context / Persona / Skills** — **inalterados**.

---

# Interfaces Necessárias

**Em `@atlas/contracts` (públicas, mudança estrutural do ADR-0026):**

```ts
export type ResourceType = 'file' | 'directory' | 'network';

export type ResourceRef =
  | { readonly type: 'file'; readonly path: string }
  | { readonly type: 'directory'; readonly path: string }
  /** Hostname puro: sem esquema, sem porta, sem caminho (ADR-0026(a)). */
  | { readonly type: 'network'; readonly host: string };

export interface AtlasConfig {
  readonly permissions: {
    readonly readRoots: readonly string[];
    readonly writeRoots: readonly string[];
    /** Allowlist de hostnames (ADR-0026(b)/(c)). Default: [] (fail-closed). */
    readonly netRoots: readonly string[];
  };
  // demais campos inalterados
}
```

**Interna a `@atlas/permissions`:**

```ts
export interface PermissionServiceDeps {
  readonly readRoots: readonly string[];
  readonly writeRoots: readonly string[];
  /** Ausente ⇒ [] (nenhum host alcançável) — fail-closed por omissão. */
  readonly netRoots?: readonly string[];
  readonly pathResolver?: PathResolverPort;
}
```

**Interna a `@atlas/tools` (não sobe a `@atlas/contracts` — D5):**

```ts
export interface HttpResponse {
  /** URL efetivamente requisitada (href normalizado). Nunca um destino de redirect. */
  readonly url: string;
  readonly status: number;
  /** Valor cru do header `content-type`, quando declarado. */
  readonly contentType?: string;
  /** Valor cru do header `location`; presente só em respostas 3xx. */
  readonly location?: string;
  /** Corpo decodificado como texto, já truncado. '' quando omitido/vazio. */
  readonly body: string;
  /** true quando o corpo foi cortado no teto de 64 KiB. */
  readonly truncated: boolean;
  /** true quando o content-type não é textual (ou ausente) e o corpo foi omitido. */
  readonly bodyOmitted: boolean;
}

export interface HttpPort {
  get(url: string): Promise<HttpResponse>;
}

/** `fetch` global do Node por default; fake nos testes (sem rede real). */
export type FetchLike = typeof fetch;

export interface NodeHttpPortDeps {
  fetch?: FetchLike;
  /** Orçamento total da requisição. Default HTTP_TIMEOUT_MS. */
  timeoutMs?: number;
}

export const HTTP_TIMEOUT_MS = 10_000;
export const HTTP_BODY_LIMIT_BYTES = 65_536; // 64 KiB
export const HTTP_TRUNCATION_MARKER = '\n[... corpo truncado em 64 KiB ...]';

export interface HttpGetDeps {
  http?: HttpPort;
}

/**
 * Resultado do helper único de derivação de alvo (D4).
 * `url` é SEMPRE `new URL(args.url).href` — a URL normalizada, nunca a string crua
 * de `args`. `host` é `hostname` em minúsculas. Com `error` presente: url='' e host=''.
 */
export interface HttpTarget {
  readonly url: string;
  readonly host: string;
  readonly error?: string;
}
```

**Dado pinado — `Tool.description` de `http_get` (D19).** Texto exato, verificado por asserção de igualdade:

```text
Busca o conteúdo de uma URL por uma única requisição HTTP GET. Recebe { url } com esquema
http ou https. Somente-leitura: nenhum outro método, nenhum cabeçalho customizado.
Redirecionamentos não são seguidos — uma resposta 3xx volta com o destino visível, sem ser
buscado. O corpo é truncado em 64 KiB e omitido quando não for texto. O host precisa estar
na lista de hosts permitidos pelo usuário, senão o passo é negado.
```

**Dado pinado — comportamento de `redirect: 'manual'` no runtime do projeto (D18).** No molde com que a SPEC-0040 pinou o contrato de invocação do Piper, a suposição de que 3xx volta legível é registrada como **dado verificado**, não como premissa implícita:

| Item | Valor pinado |
| --- | --- |
| Runtime | Node 24 (`engines.node >= 24`; CI `node-version: 24`) |
| Implementação de `fetch` | undici 7.16.0 (versão embutida no Node 24.10.0 deste projeto, lida via `process.versions.undici` — **não** a entrada `undici@7.28.0` do `pnpm-lock.yaml`, que é uma `optionalDependency` de `@electron/get`, sem relação com o `fetch` global do Node usado por `@atlas/tools`) |
| Ramo relevante | `request.redirect === 'manual'` em `fetch/index.js` |
| Comportamento esperado | a `Response` carrega o **status real** do 3xx (`301`/`302`/`307`/`308`) e o header `location` **preservado e legível** |
| Comportamento da spec WHATWG Fetch | *opaque-redirect filtered response*: `status: 0`, `type: 'opaqueredirect'`, headers vazios, **sem** `location` |

O undici **diverge deliberadamente** da spec neste ponto (a filtragem opaca existe para proteger o navegador, não um cliente servidor-side). Todo o D10 depende dessa divergência: sem ela, não há `location` a expor e a nota de "redirect não seguido" fica sem conteúdo. Como o `fetch` fake dos testes **codifica a própria suposição sob teste**, nenhum critério mecânico detectaria uma regressão futura (upgrade de Node/undici, troca de implementação) — daí a guarda de runtime de D18 ser obrigatória, e não opcional.

Nenhuma outra interface pública é criada. `Tool`/`ToolResult`/`ActionRequest`/`AccessMode` são reusados como estão.

---

# Fluxo Esperado

```text
atlas ask "resuma https://example.com/artigo" --allow-net example.com
  ↓ 1ª generate() → planner.parse → Plan { steps: [ http_get { url: "https://example.com/artigo" } ] }
  ↓ runtime.execute(plan)
       ↓ tool.requirements(args) → resolveHttpTarget → host "example.com"
              → { resource: { type:'network', host:'example.com' }, access:'read' }
       ↓ permissions.evaluate(req)   (puro, síncrono, sem IO, sem pathResolver)
              → resource.type === 'network' → 'example.com' ∈ netRoots → { verdict:'allowed' }
       ↓ tool.run(args) → resolveHttpTarget (MESMO helper) → http.get("https://example.com/artigo")
              ↓ porta: fetch(url, { method:'GET', redirect:'manual', signal })   ← sem headers
              ↓ porta: status/content-type/location capturados; corpo lido até 64 KiB; stream cancelado no teto
       ↓ ToolResult { ok:true, output:
             "url: https://example.com/artigo\nstatus: 200\ncontent-type: text/html; charset=utf-8\n\n<texto>" }
  ↓ 2ª generate() (composição) → resposta ao usuário

atlas ask "resuma https://evil.com/x"        (netRoots = ['example.com'])
  ↓ requirements → host 'evil.com'
  ↓ evaluate → { verdict:'blocked', reason:'host fora da lista permitida: evil.com' }
  ↓ ExecutedStep negado (denialKind:'blocked'); a porta HTTP NÃO é tocada; execução continua
  ↓ o modelo explica o bloqueio na resposta final

resposta 302 (host permitido)
  ↓ ToolResult { ok:true, output:
        "url: https://example.com/a\nstatus: 302\nlocation: https://outro.com/b\n
         (redirecionamento não seguido automaticamente: o host de destino precisa ser permitido
          e requisitado explicitamente)\n" }
```

Autoridade preservada: a **Tool descreve** (host como dado), o **Permission Service julga** (única autoridade de política, agora também para rede), o **Runtime aplica** o veredicto, o **Cognitive orquestra e responde** sem conhecer rede nem permissão.

---

# Estratégia de Implementação

1. **Contratos primeiro**: `ResourceType`/`ResourceRef` como união discriminada + `netRoots` em `AtlasConfig`/`AtlasConfigOverride`. Rodar `pnpm typecheck` e **catalogar** todos os sites que quebram (esperado: `permission-service.ts` e os três `ConfirmPort`) antes de tocar em mais nada — o padrão recorrente do repositório é que fakes com `as unknown as` escapam do `typecheck` e só quebram em `pnpm test`, então rodar `pnpm test` logo depois é parte deste passo.
2. **Permission Service**: normalização de `netRoots` na criação; roteamento por `resource.type` em `evaluate`; bateria de testes de rede; confirmar suíte FS intacta.
3. **Narrowing** nos três `ConfirmPort` (uma expressão cada) — restaura o `typecheck`.
4. **Porta `HttpPort`** com `fetch` fake: init exaustivo, `redirect: 'manual'`, timeout por `AbortController`, leitura incremental com teto e cancelamento, omissão de corpo não textual, captura de `content-type`/`location`.
5. **Tool `http_get`**: `resolveHttpTarget` compartilhado, `requirements` que nunca devolve `null`, `run` com `output` na forma pinada, erros sempre estruturados.
6. **Core**: default `netRoots: []`, validação de hostname em `loadConfig`, wiring (`createPermissionService` + `nodeHttpPort` + registro da Tool + `deps.http?`), testes de integração (bloqueado × permitido).
7. **CLI**: generalizar `resolveRootList` com separador, `--allow-net`, `ATLAS_ALLOW_NET`, `HELP_TEXT`, `atlas status`; testes de borda espelhando os da SPEC-0018.
8. **Verificação completa na raiz** (`typecheck`/`lint`/`test`/`format:check`), lições, docs vivas no `doc-sync` de fecho.

---

# Estratégia de Testes

- **Permission Service** (sem IO): allow/block por igualdade exata; normalização (maiúsculas, espaços) nos dois lados; subdomínio e sufixo enganoso bloqueados; host vazio bloqueado com motivo próprio; `write`/`delete` sobre rede bloqueados; ausência de `netRoots` ⇒ tudo bloqueado; `pathResolver` fake com spy provando **zero** chamadas na rota de rede; suíte FS existente inalterada.
- **`nodeHttpPort`** (`fetch` fake, `Response` real do Node para exercitar stream de verdade): asserção **exaustiva** das chaves do init; `method`/`redirect` pinados; 3xx sem segunda chamada; **guarda de redirect opaco** (`status: 0` / `type: 'opaqueredirect'` ⇒ `Error`, nunca `HttpResponse`, D18); truncagem em 64 KiB com marcador e `cancel()` do reader; corpos textuais × não textuais × `content-type` ausente; timeout com timer controlado e `signal.aborted`; rejeição de transporte virando `Error` legível.
- **`http_get`** (`HttpPort` fake com spy): `requirements` para URL válida, inválida, sem `url`, esquema não-http(s), com credenciais — nunca `null`; paridade host declarado × URL requisitada; erro de validação sem tocar a porta; `output` contendo url/status/content-type; 3xx com `location` + frase pinada; 4xx/5xx como `ok: true`; porta que lança ⇒ `ok: false`.
- **Core** (gateway fake + `http` fake): `http_get` registrado; `netRoots: []` ⇒ passo negado sem tocar a porta; host permitido ⇒ passo com sucesso e corpo na composição; `loadConfig` (merge, default, validações de hostname inválido).
- **CLI**: flag repetível, env por vírgula, precedência por substituição, filtragem/colapso, não-split por `path.delimiter`, `status` com e sem `netRoots`, `HELP_TEXT`; retro-compatibilidade integral de `--allow-read`/`--allow-write`.
- **Proibição explícita**: nenhum teste pode usar `globalThis.fetch` real. Todo caminho de rede passa por fake injetado.

---

# Definition of Done

- todos os critérios de aceitação atendidos;
- testes passando; `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes **na raiz** (não só nos packages tocados);
- documentação viva atualizada no `doc-sync` de fecho (`packages/tools/CLAUDE.md`, `packages/permissions/CLAUDE.md`, `packages/contracts/CLAUDE.md`, `packages/core/CLAUDE.md`, `apps/cli/CLAUDE.md`, `CLAUDE.md` raiz, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, nota no `Roadmap.md` l. 105), **incluindo os residuais conhecidos**; o `spec-implementer` toca só a documentação específica desta SPEC;
- arquitetura preservada: política de acesso **só** no Permission Service (nenhuma allowlist dentro de `@atlas/tools`); Tool como adaptador sem lógica de negócio nem decisão de permissão; `evaluate` puro/síncrono/sem IO; `isContained` FS-específico e intacto; Runtime sem mudança de fluxo; nenhum `AccessMode` novo; nenhum módulo/Skill/Persona novo; nenhuma dependência de runtime nova;
- residuais conhecidos escritos na SPEC e na doc viva do package;
- revisão concluída;
- lições registradas em `docs/implementation/LESSONS_LEARNED.md`.

---

# Restrições

- **Não reabrir o ADR-0026.** Método além de `GET`, seguir redirect, wildcard de host, validar IP resolvido ou dar rota de rede a `isContained` são mudanças estruturais: **pare e escale**, não decida na implementação.
- **Nenhum segredo do processo é anexado à requisição.** O init de `fetch` é literalmente `{ method, redirect, signal }`; nenhum header, cookie, credencial ou variável de ambiente é anexado, em nenhum caminho. A garantia é **essa** e apenas essa: ela **não** se estende ao conteúdo da URL, que é composta pelo modelo e cujo caminho/query string ninguém julga (residual 10). Não tentar fechar esse canal aqui — é mudança estrutural: **pare e escale**.
- **A allowlist não pode viver em `@atlas/tools`.** A Tool nunca consulta `permissions`, nunca compara host contra lista, nunca decide; `@atlas/tools` continua dependendo só de `@atlas/contracts` (Regra 5).
- **`requirements` nunca devolve `null`** para `http_get` — `null` significa Tool livre (ADR-0013) e faria a rede escapar do portão.
- O host **julgado** e o host **requisitado** derivam do mesmo helper, da mesma string de `args` (D4).
- As Tools **nunca lançam**: toda falha vira `ToolResult` estruturado.
- `evaluate` continua puro e síncrono, sem IO — a rota de rede não pode fazer DNS, `fetch` ou qualquer chamada.
- A CLI repassa valores crus; a validação de formato de host vive no core (ADR-0006).
- Não introduzir dependência de runtime nova (nada de `undici`, `axios`, `node-fetch`); `fetch` global do Node basta.

---

# Observações

- **Por que a rede não precisa da 2ª barreira que o git precisou.** A SPEC-0028 teve de descobrir o toplevel real do repositório e re-verificá-lo na porta porque o `git` **sobe pelos diretórios pais**: o recurso declarado não era o recurso lido. Aqui não existe essa distância — o host requisitado é derivado da **mesma string imutável** de `args.url` que gerou o `requirements`, e `redirect: 'manual'` garante que nenhum outro host seja contatado. Por isso esta fatia **não** estende `verify`/`isContained` a rede (e o ADR-0026(b) o proíbe): não há fato de uso novo a coletar depois do veredicto. O que resta aberto é o IP para o qual o host resolve — residual 1, herdado do ADR-0026(e), que uma barreira de string não fecharia de qualquer forma.
- **Por que 3xx volta cru em vez de virar erro.** Devolver o status e o `location` com a nota explícita mantém o Artigo 7 (o usuário entende por que não recebeu o conteúdo) e dá ao usuário o gesto seguinte óbvio: permitir o host de destino e pedir a URL nova. Transformar em erro esconderia a informação que torna a limitação contornável de forma consentida.
- **Interação com o painel `Sistema` (SPEC-0054).** O painel mede tráfego de rede **do host**, por `systeminformation`; requisições do `http_get` aparecerão nele como qualquer outro tráfego, sem nenhuma integração entre as duas fatias. Nenhuma métrica dedicada de rede é criada aqui (residual 9).
- **Cascata de `typecheck` esperada.** `AtlasConfig.permissions` ganha um campo **obrigatório** — o padrão recorrente do repositório (SPECs 0017/0019/0022/0023/0025/0039) diz que isso quebra o `typecheck` de todo fake tipado diretamente e **não** quebra os fakes com `as unknown as`, que só falham em `pnpm test`. O passo 1 da Estratégia de Implementação existe para catalogar isso cedo, não para descobrir no fim.
- **Fail-closed em três camadas independentes**: `netRoots` default `[]` (nada é alcançável sem opt-in); `requirements` devolvendo host `''` para qualquer URL inutilizável (o gate bloqueia antes da Tool rodar); e `run` recusando a URL sem tocar a porta. Uma falha em qualquer camada não abre as outras.

---

# Checklist para IA

Antes de implementar: ler o **ADR-0026** por inteiro (é a fonte estrutural — não reabrir nenhuma de suas decisões), o ADR-0013 (portão puro, `requirements` como dado, IO por porta injetável), o ADR-0006 (precedência e validação no core), a SPEC-0028 (molde da porta com limites pinados) e a SPEC-0018 (molde da borda de CLI); confirmar que os pré-requisitos estão `Done`.

Durante: contratos primeiro e `typecheck`/`test` logo em seguida para catalogar a cascata; `evaluate` sem IO na rota de rede; init de `fetch` exaustivamente pinado; helper único de derivação de alvo; `requirements` nunca `null`; toda falha estruturada; nenhuma allowlist fora do Permission Service; nenhuma dependência nova; nenhum teste com rede real.

Após: rodar os quatro comandos na raiz; validar cada critério; escrever os residuais na doc viva do package; registrar lições; concluir.

---

# Resultado Esperado

As **Tools** do Atlas passam a alcançar a internet — e a primeira coisa que elas fazem ao tentar é **pedir licença**. (O processo já falava com a rede antes desta SPEC: o Model Gateway conversa com o provedor de modelo por `fetch` desde sempre, fora de qualquer portão — residual 12. O inédito aqui é rede **julgada**.) Uma Tool `http_get` somente-leitura vive no Tool Registry, é selecionável pelo Planner quando o objetivo exige o conteúdo de uma URL, e executa atrás do mesmo portão que já governa o disco: a Tool declara o host como dado, o Permission Service julga esse host contra uma allowlist explícita (`netRoots`, vazia por padrão), o Runtime aplica o veredicto sem uma linha de mudança. Sem `--allow-net`, nenhuma requisição sai da máquina; com ele, sai exatamente uma requisição `GET`, sem cabeçalho customizado, sem segredo do processo, sem seguir redirecionamento, com teto de tempo e de tamanho, e o resultado volta ao modelo dizendo qual URL foi buscada e o que o servidor respondeu. Os contratos públicos mudam apenas na forma que o ADR-0026 já decidiu (`ResourceType: 'network'`, `ResourceRef` como união discriminada); nenhum módulo novo, nenhum `AccessMode` novo, nenhuma dependência nova, nenhum ADR aberto. As lacunas que ficam — DNS rebinding, redirect não re-julgado, ausência de wildcard, rede de Tools indisponível na GUI, e sobretudo as duas que esta fatia **abre**: a URL como canal de saída de dados que o portão não julga (residual 10) e a injeção indireta pelo corpo remoto que entra no prompt (residual 11) — ficam **escritas**, no mesmo critério de honestidade com que o ADR-0013 registrou o symlink antes da SPEC-0015. Nenhuma delas é fechada aqui; fechar qualquer uma reabriria o ADR-0026. O requisito de PRD "o sistema deve realizar pesquisas", até aqui sem nenhuma implementação, ganha sua primeira base real.

---

# Decisões de design

> Formato de veto (decisão + porquê + alternativa descartada). Atacadas pelo `architecture-reviewer` no gate `Draft → Ready`.

## D1 — Perfil: `completo`

- **Decisão**: classificar como `completo`.
- **Porquê**: falha em pelo menos quatro condições de `micro` — **toca `@atlas/contracts`** (`ResourceType`/`ResourceRef`/`AtlasConfig`), **cria uma Tool**, atravessa cinco packages/apps (`contracts`, `permissions`, `tools`, `core`, `cli`, mais um narrowing em `runtime`/`desktop`), e carrega decisões de contrato técnico não triviais. Na dúvida, `completo` (Emenda v1.2).
- **Alternativa descartada**: `micro` — a definição exclui explicitamente tocar contratos e criar Tool; classificar assim faria a SPEC cair no fast-path indevidamente.

## D2 — Prioridade: `High`

- **Decisão**: prioridade `High`.
- **Porquê**: é pedido explícito e ativo do usuário, atende um requisito funcional do PRD hoje com **zero** implementação (*"O sistema deve realizar pesquisas"*), e é a fatia para a qual o ADR-0026 foi aberto e aceito — todo o pipeline corrente está parado nela.
- **Alternativa descartada**: `Medium`, seguindo a convenção da SPEC-0028/D7 ("reservar `High` para o que bloqueia a fase") — descartada porque todos os `gate` da Fase 1 já estão fechados, então nenhuma SPEC nova bloqueia fase alguma e a convenção deixaria de discriminar qualquer coisa; o critério útil aqui é "requisito de PRD sem nenhuma cobertura + pedido direto do usuário", que `Medium` subestimaria.

## D3 — Nome `http_get`, verbo fixo `GET`, uma Tool só

- **Decisão**: a Tool se chama `http_get` e executa exclusivamente `GET`; nenhum outro verbo, nenhuma segunda Tool de rede nesta fatia.
- **Porquê**: o nome já foi antecipado nas Observações do ADR-0026 e segue o `snake_case` verbo-recurso das Tools existentes (`read_file`, `git_status`); o nome **diz o verbo**, então uma Tool futura com efeito colateral não pode se esconder atrás dela. `GET` é o subconjunto sem efeito colateral, julgável inteiramente sob `access: 'read'` — exatamente o recorte que permitiu à SPEC-0011 entregar o primeiro IO de disco sem depender do fluxo de `confirm`.
- **Alternativa descartada**: `http_request({ method, ... })` genérica — colocaria o verbo (e portanto o efeito) nas mãos do modelo, exigiria `access`/`confirm` novos e reabriria o ADR-0026. Também descartada: `fetch_url`/`web_get` — nomes que escondem o protocolo e o verbo.

## D4 — Host declarado e host requisitado saem do mesmo helper; sem 2ª barreira na porta

- **Decisão**: um helper interno único (`resolveHttpTarget`) deriva `{ url, host, error }` de `args`, e é consumido tanto por `requirements` quanto por `run`. O campo `url` é **pinado como o `.href` do objeto `URL` já parseado** (URL normalizada) — **nunca** `args.url` cru; é essa string que vai à porta, ao `fetch` e ao `output`. A porta **não** recebe predicado de verificação (`verify`/`isContained`) e não re-julga nada.
- **Porquê**: o ADR-0013 fundamenta o portão em *"julgar o recurso concreto"*; com um helper único sobre a mesma string imutável de `args.url`, o recurso julgado **é** o recurso requisitado, e `redirect: 'manual'` garante que nenhum outro host seja contatado. Pinar `url` como `href` é o que elimina **por construção** o último resíduo dessa garantia: o `host` julgado sai de `new URL(args.url)`, então mandar ao `fetch` a mesma URL já parseada impede qualquer diferencial de parser entre o helper e o `fetch` (as duas visões passam a ser literalmente o mesmo objeto). Deixar o campo ambíguo era a diferença entre "o recurso julgado é o requisitado" ser teorema ou ser esperança. Não existe aqui o "fato de uso descoberto depois" que obrigou a SPEC-0028 a verificar o toplevel do git, e o ADR-0026(b) proíbe expressamente dar rota de rede a `isContained`.
- **Alternativa descartada**: replicar o padrão da SPEC-0028 (2ª barreira na porta, via predicado injetado) — exigiria estender `isContained` a `'network'`, contrariando o ADR-0026(b), para fechar uma janela que aqui não existe. Também descartada: derivar o host em dois lugares independentes — é exatamente como as duas visões divergem em silêncio. Também descartada: devolver `args.url` cru no campo `url`, deixando a normalização por conta do `fetch` — reintroduziria **dois** parsers sobre a mesma string (o `new URL` do helper e o do `fetch`), que é precisamente onde vivem os ataques de confusão de parser de URL; e deixaria o campo ambíguo para quem implementa.

## D5 — `HttpPort` interna a `@atlas/tools`

- **Decisão**: `HttpPort`/`HttpResponse`/`nodeHttpPort` ficam em `packages/tools/src/http-port.ts`, **sem** subir a `@atlas/contracts`.
- **Porquê**: é o mesmo critério aplicado a `FsReadPort`/`FsWritePort` (SPEC-0011/0012), `ConfirmPort` (SPEC-0013), `PathResolverPort` (SPEC-0015) e `GitReadPort` (SPEC-0028): sem **2º consumidor real**, o contrato vive no package dono (regra do Project Structure + ADR-0007). Hoje o único consumidor é `http_get`; o `fetch` do `@atlas/model-gateway` **não** conta como segundo consumidor — é `typeof fetch` cru sob `HttpDeps`, um contrato diferente, com semântica (POST, headers de auth, JSON) incompatível com esta porta somente-leitura e sem headers.
- **Alternativa descartada**: promover `HttpPort` a `@atlas/contracts` "já que rede é transversal" — promoção especulativa, contrária ao ADR-0007, e que amarraria um contrato público a limites (timeout, teto de corpo) que esta primeira fatia ainda pode querer revisar. Também descartada: reusar o `HttpDeps` do Model Gateway — acoplaria Tools a um package de modelo e arrastaria a semântica de POST/auth para dentro de uma Tool que precisa provar que **não** manda headers.

## D6 — Init de `fetch` exatamente `{ method, redirect, signal }` — nenhum cabeçalho, nenhum segredo

- **Decisão**: a porta passa ao `fetch` um objeto com **essas três chaves e nada mais**; nenhum header (customizado ou não) é montado pelo Atlas, nenhum `args` do modelo pode injetar header, e um critério de aceitação assere a lista exaustiva de chaves do init.
- **Porquê**: "nenhum segredo repassado" precisa ser uma propriedade **verificável por construção**, não uma promessa de prosa — a asserção exaustiva de chaves é o teste mecânico que a garante e que quebra se alguém acrescentar `headers` no futuro. O que o `undici` do Node acrescenta por conta própria (`host`, `accept`, `accept-encoding`, `user-agent`) não carrega estado do Atlas.
- **Alcance exato da asserção**: ela cobre o **init** — isto é, os *headers* e tudo o mais que a porta anexa. Ela **não** cobre a **URL**, que é o outro argumento de `fetch` e é composta pelo modelo: caminho e query string podem carregar qualquer conteúdo do contexto e nenhum critério aqui os limita (residual 10). D6 garante que o Atlas não vaza segredo **seu**; não garante que nada saia.
- **Alternativa descartada**: aceitar `headers` opcionais nos `args` (útil para APIs) — abriria caminho para o modelo montar `Authorization`, transformando a Tool numa via de exfiltração de credenciais e num vetor de escalada que nenhuma política de host cobre. Também descartada: mandar um `User-Agent` próprio do Atlas — identificaria a ferramenta e o usuário para todo host visitado, sem benefício nesta fatia.

## D7 — Timeout total de 10 s por `AbortController`

- **Decisão**: `HTTP_TIMEOUT_MS = 10_000`, aplicado ao ciclo inteiro (conexão + leitura de corpo) por `AbortController`, injetável via `timeoutMs`; estouro produz falha **estruturada** (`ToolResult` de erro), nunca exceção propagada.
- **Porquê**: um passo de plano trava a resposta do turno inteiro enquanto não assenta; 10 s é folgado para uma página real e curto o bastante para não parecer travamento ao usuário. `AbortController` (em vez de `AbortSignal.timeout`) mantém o caminho testável com timer controlado e cobre também o streaming do corpo, não só o handshake.
- **Alternativa descartada**: 30 s ou sem timeout — um host que aceita conexão e nunca responde prenderia o turno indefinidamente (o Task Manager com timeout/cancelamento do Module Catalog não existe). Também descartada: 3 s — quebraria endpoints legítimos lentos, transformando limite técnico em falha percebida como bug.

## D8 — Teto de corpo de 64 KiB, **truncado** com marcador (não rejeitado)

- **Decisão**: ler o corpo incrementalmente até `HTTP_BODY_LIMIT_BYTES = 65_536`, cancelar o stream nesse ponto, anexar marcador visível e sinalizar `truncated: true`; o `ToolResult` segue `ok: true`.
- **Porquê**: número e comportamento espelham a SPEC-0028/D10 (`TRUNCATE_AT` de 64 KiB com marcador), pelo mesmo motivo: a saída inteira vai para a 2ª chamada de composição, então corpo sem teto é custo de token e risco de estouro de contexto. Truncar com marcador é mais honesto **e** mais útil que rejeitar — o modelo recebe o começo do documento e sabe que houve corte; rejeitar entregaria nada a partir de um limite arbitrário.
- **Alternativa descartada**: rejeitar acima do teto (erro estruturado) — desperdiça uma requisição já paga e transforma "página grande" em falha. Também descartada: um teto maior (256 KiB/1 MiB) — 256 KiB de HTML já ultrapassa dezenas de milhares de tokens; o gargalo real é o contexto do modelo, não a memória do processo. Também descartada: dois números (teto duro + teto de captura, como o `maxBuffer` do git) — a leitura incremental torna o segundo número desnecessário, e um número é mais simples que dois.

## D9 — Corpo não textual (ou `content-type` ausente) é omitido, com aviso

- **Decisão**: o corpo só é lido quando o `content-type` declarado é textual (`text/*`, `application/json`/`xml`/`xhtml+xml`/`javascript`, e subtipos `+json`/`+xml`); em qualquer outro caso — inclusive `content-type` **ausente** — o corpo é omitido (`bodyOmitted: true`) e o `output` diz por quê.
- **Porquê**: despejar bytes de PNG/PDF/zip decodificados como UTF-8 no prompt é ruído caro e ilegível; fechar no caso ambíguo (sem `content-type`) é a postura fail-closed consistente com o resto da plataforma, e o status + tipo declarado ainda chegam ao modelo, que pode explicar ao usuário.
- **Alternativa descartada**: tratar `content-type` ausente como textual — otimista justamente no caso em que não há informação. Também descartada: decodificar tudo e deixar a truncagem resolver — 64 KiB de binário como texto é o pior uso possível do orçamento de contexto. Também descartada: devolver base64 — nenhum consumidor sabe o que fazer com isso nesta fatia.

## D10 — Qualquer resposta HTTP recebida é `ok: true`; 3xx expõe `location` com nota explícita

- **Decisão**: 2xx, 3xx, 4xx e 5xx produzem `{ ok: true, output }` com `status` (e, em 3xx, o `location` mais a frase de que o redirect **não** foi seguido); apenas validação de argumento e falha de transporte/timeout produzem `{ ok: false, error }`. Dos headers de resposta, só `content-type` e `location` são expostos.
- **Porquê**: `ToolResult.ok` significa "a Tool executou o que se propôs", não "o servidor gostou" — um 404 é uma resposta legítima e informativa, e marcá-lo como falha faria o observador do ADR-0015 considerar replanejamento por algo que não é falha de execução. Expor o `location` sustenta o Artigo 7 (o usuário entende o que aconteceu e qual é o gesto seguinte); limitar os demais headers evita vazar `set-cookie` e afins para dentro do prompt.
- **Alternativa descartada**: `ok: false` para todo status ≥ 400 — perderia o corpo da resposta de erro (muitas vezes o dado mais útil) e confundiria o laço de observação. Também descartada: expor todos os headers — superfície de vazamento sem consumidor definido. Também descartada: esconder o `location` — opacidade num ponto em que o usuário tem uma ação concreta disponível.

## D11 — URL com credenciais embutidas é recusada

- **Decisão**: URL cujo `username`/`password` não estejam vazios (`https://user:pass@host/…`) é recusada em `run` (erro estruturado) e produz host `''` em `requirements`.
- **Porquê**: o `fetch` converteria essas credenciais em `Authorization: Basic`, contradizendo o "nenhuma credencial é enviada" de D6 por uma via lateral, e o formato é o vetor clássico de confusão de parser sobre qual é o host real. Recusar é uma linha e fecha os dois problemas.
- **Alternativa descartada**: aceitar e deixar o `fetch` mandar as credenciais — o usuário poderia legitimamente querer isso, mas nesta fatia não há como ele consentir de forma visível, e o consentimento invisível é exatamente o que o Artigo 8 e o ADR-0013 recusam. Também descartada: silenciosamente remover as credenciais da URL — mudar a URL que o usuário/modelo pediu sem avisar é menos transparente que recusar com motivo.

## D12 — `netRoots` opcional na porta do serviço, obrigatório na config resolvida

- **Decisão**: `PermissionServiceDeps.netRoots?` é **opcional** com default `[]`; `AtlasConfig.permissions.netRoots` é **obrigatório**; `AtlasConfigOverride.permissions.netRoots?` é opcional.
- **Porquê**: na porta do serviço, omitir é o valor mais seguro (`[]` = nada alcançável), então opcionalidade e fail-closed coincidem — e todo construtor existente (`@atlas/core`, testes) segue válido com comportamento byte-idêntico. Na **config resolvida**, o campo obrigatório mantém a simetria com `readRoots`/`writeRoots`: `AtlasConfig` descreve o estado efetivo e completo, sem `undefined` a interpretar em quem lê (`atlas status`, painéis).
- **Alternativa descartada**: obrigatório também em `PermissionServiceDeps` — quebraria construtores por nenhum ganho de segurança (o default já é o valor mais restritivo). Também descartada: opcional em `AtlasConfig` — introduziria um terceiro estado ("não configurado") indistinguível de "vazio" para todo leitor da config, e a cascata de `typecheck` que se evita aí é justamente a que se **quer** (obriga todo fake de config a se declarar sobre rede).

## D13 — Normalização de host: `trim` + minúsculas, e nada mais

- **Decisão**: os dois lados da comparação (entradas de `netRoots`, na criação; `resource.host`, em `evaluate`) passam por `trim()` + `toLowerCase()`. **Não** há remoção de ponto final de FQDN, **não** há conversão IDN/punycode, **não** há sufixo/wildcard.
- **Porquê**: o ADR-0026(b) pinou "igualdade exata, case-insensitive"; minúsculas e espaços são a normalização mínima que torna a igualdade utilizável (DNS é case-insensitive e um espaço colado numa flag é erro de digitação, não intenção). Tudo além disso muda o **conjunto** de hosts alcançáveis e é decisão do ADR, não desta SPEC. Os casos não normalizados (`example.com.`, Unicode × punycode) falham **fechados**, então a omissão nunca abre acesso.
- **Alternativa descartada**: normalizar ponto final e IDN também — só afrouxaria (nunca endureceria), e afrouxar a fronteira decidida por um ADR aceito dois dias antes é precisamente o que o `spec-drafter` não pode fazer sozinho. Registrados como residuais 6 e candidatos futuros.

## D14 — CLI entra nesta mesma SPEC; `resolveRootList` generalizada por separador

- **Decisão**: `--allow-net <host>` (repetível) e `ATLAS_ALLOW_NET` (vírgula) entram nesta SPEC, reusando o helper existente da SPEC-0018 com um parâmetro de separador; a validação de formato de host fica no `loadConfig`, não na CLI.
- **Porquê**: sem borda de entrada a Tool é **inatingível** por qualquer usuário real (default `[]`), e uma capacidade que ninguém consegue ligar não é entregável — mesmo raciocínio pelo qual a SPEC-0011 já veio com `--allow-read` funcional. Generalizar o helper evita uma segunda implementação de "flag repetível > env, com trim/filtragem/colapso", que é onde as duas divergiriam. Validação no core é o ADR-0006 literal (a CLI repassa cru).
- **Alternativa descartada**: SPEC separada só para a CLI — deixaria a plataforma com uma Tool morta entre as duas SPECs. Também descartada: copiar `resolveRootList` mudando o separador — duplicação de uma regra de borda com quatro casos de canto já testados. Também descartada: validar hostname na CLI — quebraria a fronteira do ADR-0006 e criaria dois lugares que decidem o que é um host válido.

## D15 — `atlas status` passa a exibir `netRoots`

- **Decisão**: `runStatus` imprime `netRoots: <lista>` ou `(nenhum)`, no formato já usado por `writeRoots`. O rótulo descreve a política de **Tools**: `netRoots` governa quais hosts as Tools do Atlas podem alcançar, **não** todo o tráfego do processo — o endpoint do provedor de modelo (`@atlas/model-gateway`) fica fora dessa política (residual 12), e `netRoots: (nenhum)` **não** quer dizer que o processo esteja offline.
- **Porquê**: `status` é o único lugar onde o usuário confere a política efetiva; uma política de rede invisível seria a primeira permissão do Atlas que o usuário não consegue auditar (Artigo 7, e *Transparência* no PRD). Escopar o rótulo é parte da mesma transparência: exibir `netRoots` sem dizer o que ele cobre induziria a leitura errada de que a lista vazia sela o processo inteiro. Custo: três linhas.
- **Alternativa descartada**: deixar para uma fatia futura de UX — economiza quase nada e entrega uma capacidade de rede cuja configuração vigente o usuário não tem como ver.

## D16 — Narrowing local nos três `ConfirmPort`, sem helper compartilhado

- **Decisão**: cada um dos três `ConfirmPort` (`@atlas/runtime`, `apps/cli`, `apps/desktop`) resolve o rótulo do recurso com uma expressão local (`resource.type === 'network' ? resource.host : resource.path`).
- **Porquê**: `@atlas/contracts` é declaradamente type-only (runtime permitido: só classes de erro e constantes triviais), então um `describeResource()` compartilhado não cabe lá; e fazer `apps/desktop`/`apps/cli` dependerem de `@atlas/runtime` só para formatar uma string acrescentaria uma aresta de dependência entre app e package de execução por um ganho de três linhas. Nesta fatia nenhum recurso de rede chega a produzir `confirm` (rede só produz `allowed`/`blocked`), então o narrowing é puramente estrutural.
- **Alternativa descartada**: helper em `@atlas/contracts` (violaria a regra type-only do package) ou em `@atlas/runtime` importado pelos apps (aresta de dependência nova por uma string). Se uma fatia futura criar rede com `confirm`, o texto do diálogo precisará ser **específico de rede** de qualquer forma — e aí o lugar certo é cada porta, não um helper genérico.

## D17 — `apps/desktop` fica sem política de rede nesta fatia

- **Decisão**: a GUI não ganha configuração de `netRoots`; um Core aberto pela janela sempre roda com `netRoots: []`, logo `http_get` — e qualquer Tool de rede — é sempre bloqueado ali. O que fica indisponível são as **Tools**: o Model Gateway da janela segue falando com o provedor remoto como sempre fez (residual 12), então a GUI não fica offline. Registrado como residual 8 e candidato futuro.
- **Porquê**: expor rede na GUI exigiria repetir todo o desenho de consentimento da SPEC-0038 (diálogo de concessão de política, aplicação tudo-ou-nada, recusa com operação em voo, encerramento de sessões) para um eixo novo — é uma fatia inteira, com decisões de UX próprias, e amarrá-la aqui dobraria o tamanho desta SPEC. A ausência é **fail-closed**: nenhuma capacidade regride, nada fica meio configurado.
- **Alternativa descartada**: incluir o painel de rede na GUI agora — escopo grande, e o consentimento visual de rede merece o mesmo cuidado que o de escrita recebeu, não um apêndice. Também descartada: deixar a GUI herdar `ATLAS_ALLOW_NET` do ambiente — o desktop não lê env de permissão hoje (só a CLI o faz), então isso seria um mecanismo novo, invisível na interface, concedendo rede sem gesto do usuário.

## D18 — `redirect: 'manual'` é suposição **pinada** sobre o undici, com guarda fail-closed se ela não se sustentar

- **Decisão**: registrar como **dado verificado** (tabela em "Interfaces Necessárias") que, no runtime deste projeto — Node 24, undici 7.16.0 (versão embutida no Node 24.10.0 deste projeto, lida via `process.versions.undici` — **não** a entrada `undici@7.28.0` do `pnpm-lock.yaml`, que é uma `optionalDependency` de `@electron/get`, sem relação com o `fetch` global do Node usado por `@atlas/tools`), ramo `request.redirect === 'manual'` de `fetch/index.js` —, uma resposta 3xx chega com o **status real** e o header `location` legível, e que isso **diverge deliberadamente** da spec WHATWG Fetch (que prescreve *opaque-redirect filtered response*: `status: 0`, `type: 'opaqueredirect'`, headers vazios, sem `location`). E, no código, **guardar o caso contrário**: `status === 0` ou `type === 'opaqueredirect'` ⇒ falha estruturada explícita ("destino do redirect não pôde ser revelado"), nunca `ok: true`.
- **Porquê**: todo o D10 (3xx devolvido com `status`/`location` + nota) repousa nesse comportamento não-spec, e o `fetch` fake dos testes **codifica a própria suposição sob teste** — logo nenhum critério mecânico desta SPEC detectaria a divergência num upgrade futuro de Node/undici. Pinar a versão e o comportamento exato dá ao leitor futuro a âncora que a SPEC-0040 deu ao contrato do Piper (por que o argv é aquele, contra qual versão); a guarda de runtime transforma "a suposição quebrou" de bug silencioso — um `status: 0` narrado ao modelo como se fosse uma resposta HTTP normal, sem `location`, sem corpo, sem explicação — em falha visível e legível. Fail-closed é a única postura coerente com o resto da fatia (D9, D11, `netRoots: []`).
- **Alternativa descartada**: confiar no comportamento sem pinar nem guardar — é exatamente a classe de premissa que envelhece em silêncio e reaparece como bug incompreensível três SPECs depois. Também descartada: implementar redirect seguido/re-julgado para não depender disso — reabriria o ADR-0026(d). Também descartada: tratar `status: 0` como um 3xx genérico e seguir com `ok: true` — apresentaria ao modelo uma resposta que o Atlas não conseguiu ler como se a tivesse lido, violando o Artigo 7.

## D19 — `Tool.description` de `http_get` é pinada como dado

- **Decisão**: o texto exato de `description` fica pinado em "Interfaces Necessárias" e é verificado por asserção de igualdade; ele comunica quatro coisas: só `GET`, redirect **não** seguido, corpo truncado/omitido conforme os limites, e host precisa estar na lista permitida.
- **Porquê**: `description` é a **única** superfície pela qual o Planner descobre e seleciona a Tool — `planner.ts` monta a lista de ferramentas como `- ${tool.name}: ${tool.description}` e nada mais do contrato chega ao modelo. Uma descrição vaga faz o Planner escolher `http_get` para objetivos que ela não atende (seguir um encurtador, mandar um `POST`, baixar um PDF) e produz turnos que falham por desenho, não por erro. Pinar o texto é o mesmo molde de `read_file`/`git_status` (que já dizem "Recebe { path }", "Somente-leitura"), agora com a diferença de que aqui os limites são **decisões desta SPEC** (D8/D9/D10) e precisam chegar ao modelo, senão viram surpresa. Pinar como dado também impede que o texto derive numa edição futura sem revisão.
- **Alternativa descartada**: deixar a `description` a cargo da implementação — é o campo mais load-bearing do comportamento observável da Tool e o menos coberto por testes se não for pinado. Também descartada: uma descrição curta ("Busca o conteúdo de uma URL") — o Planner não teria como saber que 3xx não completa, que binário volta sem corpo e que host precisa de opt-in, e gastaria passos aprendendo isso por tentativa. Também descartada: enfiar a `netRoots` vigente na `description` — a Tool não conhece política (Regra 5), e a lista mudaria a cada configuração.
