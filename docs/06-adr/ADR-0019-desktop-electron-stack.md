# ADR-0019 — Stack Electron para `apps/desktop`

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-22

---

# Contexto

O [Roadmap](../04-engineering/Roadmap.md) marca o item **2.1 — Fundação da Interface** como a primeira fatia da Fase 2, e registra a escolha de stack para `apps/desktop` como "candidata a ADR próprio" (l. 141). O [WorkspaceStrategy.md](../03-architecture/WorkspaceStrategy.md) já previa `atlas-desktop` → `apps/desktop/`, e o [ProjectStructure.md](../03-architecture/ProjectStructure.md) já reserva o diretório com responsabilidades documentadas (interface gráfica, janela, entrada por texto, integração visual com o SO, futura voz) — mas nenhuma linha de código o materializa até esta SPEC. A Fase 1 está fechada (SPEC-0029/0030) e o usuário decidiu explicitamente iniciar a Fase 2 nesta sessão (decisão humana, exigida pelo Roadmap l. 190).

Criar `apps/desktop` exige escolher, antes do primeiro código, **como um app desktop nativo multiplataforma (Windows/macOS/Linux) hospeda uma janela e chama o Core em Node.js sem expor `packages/*` ao processo de renderização**. Esta é uma decisão de stack — não uma decisão de módulo (não cria package novo, não move responsabilidade do Module Catalog) — mas é estrutural o suficiente (fixa a tecnologia de runtime de todo o produto desktop) para exigir ADR, exatamente como o Roadmap já assinalava.

**A decisão foi tomada pelo humano no brainstorming desta sessão: Electron.** Este ADR formaliza essa escolha, registra as alternativas descartadas e — correção vinculante do gate `Draft → Ready` do `architecture-reviewer` — a tensão que ela abre com o Artigo 13 da Constituição.

---

# Decisão

**`apps/desktop` (`@atlas/desktop`) é construído sobre Electron.** O main process (Node.js) importa `@atlas/core`/`@atlas/contracts` e é o único lugar onde o Core vive; o renderer (Chromium) nunca importa `packages/*`, comunicando-se com o main exclusivamente por IPC (`ipcMain.handle`/`ipcRenderer.invoke`) através de uma ponte `contextBridge`, com `contextIsolation: true` e `nodeIntegration: false`. `electron` entra como `devDependency` do app — o binário do Electron é a ferramenta de execução (analogia de **lugar** com o `tsx` do [ADR-0005](ADR-0005-app-typescript-execution.md): nenhuma dependência de empacotamento entra na raiz do workspace nem em `@atlas/core`/`@atlas/contracts`), não um sinal de que Electron seja dev tooling descartável.

**Tensão consciente com o Artigo 13 (nenhuma dependência permanente de framework), registrada honestamente — não dissolvida.** O [ADR-0004](ADR-0004-manual-composition.md) já cita esse princípio ao justificar composição manual sem container de DI. Ali a dependência evitada era *interna* ao Core (um framework de DI orquestrando a composição). Aqui a dependência é *de runtime do produto*: o processo inteiro do app desktop — ciclo de vida da aplicação, janela, IPC, empacotamento futuro — passa a rodar **dentro** do runtime do Electron. Isso é qualitativamente diferente do `tsx` (ferramenta de execução do *dev loop*, substituível sem tocar a superfície do produto) e diferente de uma lib pontual: **Electron é o framework de runtime permanente do produto desktop**, e não há como "tirar o Electron depois" sem reescrever `apps/desktop` inteiro. Adotá-lo é **aceitar conscientemente essa exceção ao Artigo 13**, não justificá-la por analogia com dev tooling. A exceção é contida: o Core (`packages/*`) permanece livre de qualquer dependência de Electron — só `apps/desktop` (a casca de interação, camada Interaction do Module Catalog) carrega a stack. O Artigo 13 protege o Core e os contratos públicos de acoplamento a framework; `apps/desktop` é, por natureza, uma casca de interação que precisa de *algum* runtime de janela — a escolha aqui é qual, não se.

**Por que Electron, e não as alternativas descartadas no brainstorming (decisão humana):**

- **Tauri** (Rust + WebView do SO) foi descartado porque seu processo "backend" nativo é Rust, não Node.js — chamar `createAtlas()` diretamente exigiria uma ponte adicional (sidecar Node, ou reescrever a composição em Rust), quebrando o consumo direto dos contratos públicos que a SPEC-0002/0003 já estabeleceram para toda aplicação Atlas. Electron mantém o main process em Node.js, onde `createAtlas()` já roda sem adaptação.
- **Servidor local + UI web** (um processo Node expõe `createAtlas()` por HTTP/WebSocket local, consumido por uma página aberta no navegador do usuário) foi descartado por não ser um **app desktop nativo**: não há janela própria, ícone de dock/taskbar, ciclo de vida de aplicação ou integração com o SO — contradiz as responsabilidades já documentadas em `ProjectStructure.md` ("janela ou menu bar", "integração visual com o sistema operacional"). Seria, na prática, reimplementar a CLI como servidor, adiando a decisão de interface gráfica em vez de resolvê-la.

Electron é a única das três opções que mantém o Core em Node.js sem ponte adicional **e** entrega um app desktop nativo de verdade (janela, ciclo de vida, integração com o SO), ao custo da exceção ao Artigo 13 registrada acima.

**Sem `dist/` nesta fatia — extensão do ADR-0005.** O main process roda o fonte `.ts` via `tsx`, como qualquer outra aplicação do workspace; preload e renderer (contexto Chromium, não-Node) ficam em JavaScript plano. Empacotamento e distribuição (instalador, binário assinado, `electron-builder`) são decisão de Fase 3, fora desta fatia.

---

# Consequências

Positivas:

- `apps/desktop` ganha um app desktop nativo real, multiplataforma, com o Core rodando em Node.js sem ponte de linguagem — o mesmo padrão de consumo direto de `createAtlas()` que a CLI já usa;
- a fronteira de segurança do Electron (`contextIsolation`/`nodeIntegration`/`contextBridge`) coincide exatamente com a fronteira arquitetural que o Artigo 4 já exige (Core só no main process; renderer nunca toca `packages/*`) — a stack reforça, em vez de tensionar, essa regra específica;
- o padrão sem-`dist` (ADR-0005) se estende ao main process sem mudança de princípio.

Custos e riscos:

- **exceção consciente ao Artigo 13**, registrada aqui em vez de dissolvida por analogia: Electron é dependência de runtime permanente do produto desktop, não tooling descartável; a exceção fica contida a `apps/desktop` — `packages/*` permanece livre dela;
- Electron embute um binário Chromium+Node por processo — app desktop mais pesado (tamanho de instalação, memória) do que alternativas nativas (Tauri) ou uma UI web fina; aceito em troca de manter o Core em Node.js sem ponte;
- empacotamento/distribuição (assinatura, instalador, atualizações automáticas) trarão complexidade própria em Fase 3 — fora do raio desta decisão, mas é custo já previsível da escolha.

---

# Alternativas Consideradas

**Tauri.** Runtime mais leve (WebView do SO em vez de Chromium embutido) e binário menor. Descartada porque o processo nativo é Rust — o Core, em TypeScript/Node.js, não pode ser chamado diretamente; exigiria um sidecar Node.js ou reescrever a composição do Atlas em Rust, quebrando o padrão de consumo direto de `createAtlas()` que toda aplicação do workspace segue.

**Servidor local + UI web (navegador).** Zero framework de runtime de janela: um processo Node expõe `createAtlas()` por um servidor local, consumido por uma página web comum. Descartada porque não é um app desktop nativo — sem janela, ícone, ciclo de vida ou integração com o SO, contradizendo as responsabilidades já documentadas para `apps/desktop`; seria uma segunda CLI-como-servidor, não a interface gráfica que a Fase 2 pede.

**Adiar a decisão de stack e não criar `apps/desktop` ainda.** Preservaria o Artigo 13 intacto por mais tempo. Descartada: a Fase 2 foi explicitamente aberta pela decisão humana desta sessão, e o Roadmap já assinala a escolha de stack como bloqueio da primeira fatia — adiar sem necessidade contradiz a decisão já tomada de avançar.
