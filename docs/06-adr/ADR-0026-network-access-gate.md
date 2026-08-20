# ADR-0026 — Network Access Gate: portão de rede no Permission Service

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-08-19

---

# Contexto

O usuário pediu que o Atlas seja capaz de se conectar à internet. O PRD já
cobre parcialmente esse pedido — "o sistema deve realizar pesquisas" e "deve
integrar ferramentas externas quando necessário" (Requisitos Funcionais) e
"utilizar ferramentas externas quando necessário" (Critérios de Aceitação do
Produto) — mas a seção "Fora do Escopo Inicial" exclui explicitamente
"integrações específicas que não possuam arquitetura definida". Até esta
decisão, nenhuma arquitetura de acesso à rede existia: todas as Tools com
efeito colateral entregues até a SPEC-0054 (`@atlas/tools`: FS + git
somente-leitura) operam exclusivamente sobre o disco local, e o Permission
Service ([ADR-0013](ADR-0013-permission-service-execution-gate.md)) só
conhece um eixo de política — contenção lexical de caminho contra
`readRoots`/`writeRoots`, endurecida por `realpath` na
[SPEC-0015](../implementation/specs/SPEC-0015-permission-symlink-hardening.md).

O `spec-drafter`, ao tentar desenhar a primeira SPEC de conectividade,
escalou: um host/URL não é um caminho e não tem "raiz" a conter — a política
necessária é uma allowlist de domínios, um eixo de decisão novo, com uma
classe de ameaça sem análogo já decidido no projeto (SSRF, redirect para host
não autorizado, exfiltração). Declarar a Tool sem portão, ou colocar a
allowlist dentro de `@atlas/tools`, violaria o Permission Service como
autoridade exclusiva de política (Module Catalog) sem revisão arquitetural —
exatamente o caso 3 da Emenda v1.1 da Constituição ("criar um novo ADR").

O usuário aprovou explicitamente abrir este ADR antes de qualquer SPEC.

---

# Decisão

**(a) A rede é um eixo de recurso novo dentro do Permission Service
existente — não um serviço novo, não um módulo novo.** `ResourceType` em
`@atlas/contracts` ganha `'network'` ao lado de `'file'`/`'directory'`, e
`ResourceRef` passa a ser uma união discriminada por `type`: as variantes
`'file'`/`'directory'` mantêm `path: string`, inalteradas; a variante nova
`'network'` carrega `host: string` (hostname puro, sem esquema/porta/caminho)
em vez de `path`. `AccessMode` não ganha modo novo — a primeira Tool de rede
usa `access: 'read'`; `'write'`/`'delete'` continuam com o significado atual
de FS e não se aplicam a `'network'` nesta fatia (nenhuma Tool de rede com
efeito é desenhada aqui).

**(b) `PermissionService` ganha uma política irmã de `readRoots`/`writeRoots`:
`netRoots` — allowlist de hostnames, não de caminhos.** `evaluate` roteia por
`resource.type`: `'file'`/`'directory'` seguem o caminho já existente
(contenção lexical sobre `realpath`, inalterado); `'network'` compara
`resource.host` contra `netRoots` por **igualdade exata de string**,
case-insensitive (`example.com` ≠ `sub.example.com`; sem wildcard/subdomínio
nesta fatia — candidato explícito de fatia futura, mesma disciplina de escopo
mínimo que o ADR-0013 aplicou à contenção lexical antes de existir
`realpath`). `evaluate` continua **puro e síncrono, sem IO** — a comparação de
string não exige resolução de DNS nem chamada de rede. `isContained`
(consumido pelo fecho atômico de TOCTOU do
[ADR-0014](ADR-0014-toctou-atomic-enforcement.md)) **não** ganha rota de
rede nesta fatia — seu contrato documentado é FS-específico (`realpath`
ancorado a um fd) e não tem equivalente de rede decidido aqui.

**(c) Default fail-closed: `netRoots` vazio por padrão.** Mesma postura que
`writeRoots` adotou após a
[SPEC-0012](../implementation/specs/SPEC-0012-write-file-tool.md): sem
opt-in explícito, nenhum host é alcançável. Configuração pela mesma
precedência do [ADR-0006](ADR-0006-config-source-precedence.md)
(`flags > env > defaults`): flag `--allow-net <host>` repetível na CLI
(molde de `--allow-read`/`--allow-write`, [SPEC-0018](../implementation/specs/SPEC-0018-multiple-permission-roots-cli.md)),
env `ATLAS_ALLOW_NET` com lista separada por vírgula — **não** por
`path.delimiter`, porque hostnames não são caminhos de arquivo.

**(d) Redirect não é seguido automaticamente.** A porta de rede que a
primeira Tool usa (ver Observações) recebe a resposta HTTP de qualquer status
— incluindo 3xx — sem seguir o `Location` automaticamente. Seguir um redirect
re-executaria implicitamente contra um host que nunca passou por `evaluate`,
abrindo a classe de escape que o ADR-0013 documentou como limitação conhecida
para symlink antes de existir `realpath` (SPEC-0015). Redirect
cross-host explícito e auditável (cada hop revalidado contra `netRoots`) fica
como candidato de fatia futura, mesmo padrão de "endurecimento adiado, e
declarado" que o ADR-0013 usou para symlink.

**(e) Resolução de DNS/IP não é validada pelo Permission Service.** DNS
rebinding (um hostname permitido que resolve para um IP interno/privado no
momento da conexão) é uma limitação conhecida e **não** tratada por esta
decisão — `evaluate` julga o hostname declarado, não o IP resolvido; validar
o IP resolvido antes de conectar (bloqueando ranges privados/loopback) é
responsabilidade candidata da porta de rede em fatia futura, não do portão de
permissão puro. Registrar essa lacuna explicitamente, em vez de fechá-la por
omissão, é o mesmo padrão de honestidade arquitetural do ADR-0013 (Custos e
riscos).

---

# Consequências

Positivas:

- Reaproveita a arquitetura de portão já validada (Tool declara
  `requirements`, Permission Service julga puro/síncrono, Runtime aplica o
  veredicto) — nenhuma peça nova no fluxo de execução, só um `ResourceType` e
  uma política a mais.
- Postura fail-closed idêntica à de `writeRoots`: instalar o Atlas não abre
  rede nenhuma; o usuário precisa optar explicitamente, host por host.
- Desbloqueia a exclusão do PRD ("integrações específicas que não possuam
  arquitetura definida") sem exigir emenda ao PRD — a arquitetura passa a
  existir.
- `@atlas/permissions`/`@atlas/contracts` seguem os únicos módulos tocados
  estruturalmente; `@atlas/runtime` não muda uma linha (já é agnóstico ao
  `access`/`resource.type`, mesma garantia que o ADR-0013 já entregava para
  FS).

Custos e riscos:

- **Sem wildcard de subdomínio nesta fatia** — um serviço que usa múltiplos
  subdomínios (`api.x.com`, `cdn.x.com`) exige listar cada host
  explicitamente. Aceito conscientemente como escopo mínimo; wildcard é
  candidato futuro se o uso real mostrar necessidade.
- **Sem validação de IP resolvido (DNS rebinding)** — limitação conhecida,
  registrada em (e), não escondida.
- **Sem redirect automático** — Tools que dependem de redirect (comum em
  encurtadores de URL, alguns endpoints de busca) recebem o 3xx cru e não o
  destino final nesta fatia; UX menos conveniente em troca de não introduzir
  a superfície de risco de (d) sem desenho próprio.
- Introduz o primeiro caminho de saída de rede real do Atlas — expande a
  superfície de auditoria e de custo (requisições podem ter latência,
  indisponibilidade e, dependendo do host, custo financeiro de terceiros) de
  um jeito que nenhuma Tool anterior tinha.

---

# Alternativas Consideradas

**Allowlist dentro da própria Tool/porta de rede em `@atlas/tools`, sem
tocar o Permission Service.** Mais rápido de implementar, mas cria um
segundo lugar que concede permissão fora da autoridade única que o Module
Catalog atribui ao Permission Service — rejeitada pelo mesmo motivo que a
SPEC-0028/D2 recusou introduzir um `AccessMode` novo fora do gate central:
política de acesso pertence ao Permission Service, não a uma Tool individual.

**Reaproveitar `ResourceRef.path` para carregar a URL/host como string, sem
`ResourceType` novo.** Evitaria a união discriminada, mas colapsaria duas
semânticas de contenção incompatíveis (prefixo lexical de caminho ×
igualdade de hostname) no mesmo campo — o `evaluate` teria que inferir por
formato de string qual algoritmo aplicar, um acoplamento implícito e frágil.
Rejeitada: um `ResourceType` explícito mantém as duas políticas
estruturalmente distintas e testáveis em isolado, como o ADR-0013 já fez
entre `read`/`write`/`delete`.

**Endurecer DNS rebinding e redirect cross-host já nesta fatia.** Maior o
ADR e a primeira SPEC resultante, sem uma Tool real ainda em produção para
validar que o endurecimento é o desenho certo. Rejeitada por ora — mesmo
raciocínio do ADR-0013 ao adiar `realpath`/symlink para a SPEC-0015: primeiro
entregar o portão mínimo e correto, endurecer depois com uso real
observado.

**Wildcard de subdomínio (`*.example.com`) desde já.** Adiciona um segundo
algoritmo de correspondência (sufixo, não igualdade) antes de haver
qualquer Tool real que precise disso. Rejeitada nesta fatia; igualdade exata
é o subconjunto mais simples e mais fácil de auditar visualmente numa
allowlist curta.

---

# Observações

- Este ADR resolve apenas a **arquitetura do portão de permissão**. O
  **contrato técnico exato da primeira Tool de rede** (nome, assinatura,
  timeout, teto de tamanho de resposta, cabeçalhos permitidos/proibidos,
  porta injetável e seu fake de teste) é dado pela SPEC que a implementa, não
  duplicado aqui — mesmo enquadramento que o ADR-0021/ADR-0022/ADR-0024
  já usam em relação às respectivas SPECs.
- O `spec-drafter` já registrou a recomendação de escopo mínimo para essa
  primeira SPEC: uma única Tool somente-leitura (`http_get`), allowlist via
  `netRoots`, timeout e teto de corpo de resposta, sem métodos com efeito
  colateral (`POST`/`PUT`/`DELETE`) e sem repasse de cabeçalhos/segredos do
  processo do Atlas para o host remoto — candidato a próximo número de SPEC
  livre no momento em que este ADR foi aceito.
- Este ADR não reabre nenhuma decisão estrutural do ADR-0013 (portão puro,
  `evaluate` síncrono, `free` como ausência de `requirements`) — apenas
  estende o vocabulário de `ResourceType`/política que ele já define.

---

# Atualização ([SPEC-0055](../implementation/specs/SPEC-0055-http-get-network-access.md))

A SPEC-0055 concretizou o contrato técnico que esta decisão deixou explicitamente delegado (Observações), sem reabrir nenhuma das cinco decisões estruturais (a)–(e):

- **A primeira Tool de rede é `http_get`** (`packages/tools/src/http-get.ts`/`http-port.ts`), exatamente como as Observações previam: somente-leitura, `GET` único, `HttpPort`/`nodeHttpPort` injetável (interna a `@atlas/tools`, sem 2º consumidor real — o `HttpDeps` do `@atlas/model-gateway` não conta, é um contrato incompatível), timeout de 10 s, corpo truncado em 64 KiB, sem cabeçalho/segredo do processo repassado (`fetch` com init exaustivo `{ method, redirect, signal }`).
- **(b) confirmada na prática**: `isContained` não ganhou rota de rede; o helper único de derivação de alvo (`resolveHttpTarget`) faz o recurso julgado e o recurso requisitado serem literalmente a mesma string (`new URL(args.url).href`), fechando por construção a distância que motivaria uma 2ª barreira — sem precisar de TOCTOU/`verify` para rede.
- **(d) exercitada com uma guarda nova**: `redirect: 'manual'` depende de o undici embutido no Node **divergir deliberadamente** da spec WHATWG Fetch (que prescreveria `status: 0`/`type: 'opaqueredirect'`); a SPEC pinou esse comportamento como dado verificado (versão exata do runtime) e adicionou uma guarda fail-closed para o caso em que a suposição não se sustentar — nunca `ok: true` travestindo um `status: 0` de resposta normal.
- **Dois residuais novos, fora do que este ADR já registrava em (e)/Custos e riscos, ficam documentados e não fechados**: a URL é um canal de saída de dados que o portão não julga (avalia só o host, nunca o path/query string da requisição — combinado com `--allow-read` já concedido, é o primeiro caminho de exfiltração da plataforma) e a injeção indireta de prompt pelo corpo remoto (primeira vez que texto de terceiro não confiável entra no prompt de planejamento/composição). Fechar qualquer um dos dois é mudança estrutural nova — reabriria este ADR.
- **`apps/desktop` fica sem `netRoots` nesta fatia** (D17 da SPEC) — decisão de escopo da SPEC, não deste ADR: expor rede na GUI exigiria repetir o desenho de consentimento da SPEC-0038 para um eixo novo.
- Não fecha o item 1.4 do Roadmap — seguem candidatas execução de comandos sob o Permission Service, leitura de estrutura de projeto, e os próprios residuais acima (redirect por hop, wildcard de subdomínio, IP resolvido).
