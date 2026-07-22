# SPEC-0031 — Desktop Foundation

> **Project Atlas — Implementation Specification**

---

# Informações Gerais

**ID**

SPEC-0031

---

**Título**

Desktop Foundation — primeira janela do app desktop (`apps/desktop`), um round-trip com o Core

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

---

**Perfil**

- [ ] micro
- [x] completo

---

**Item do Roadmap**

`Fase 2 — 2.1 Fundação da Interface` (`docs/04-engineering/Roadmap.md`, l. 139-143), primeira fatia: bootstrap de `apps/desktop`. A decisão de stack está marcada como "candidata a ADR próprio" (l. 141) — esta SPEC exige o **ADR-0019** novo (stack Electron + criação do app), decisão humana já tomada no brainstorming desta sessão e formalizada aqui.

---

# Objetivo

Criar `apps/desktop` (`@atlas/desktop`), a primeira interface gráfica do Atlas, sobre a stack **Electron**, provando o Core de ponta a ponta numa janela — o equivalente desktop do que a [SPEC-0003](SPEC-0003-cli-foundation.md) fez no terminal com `atlas status`.

Ao final desta SPEC deverá existir um app Electron que: abre uma janela; no **main process** (Node.js) chama `createAtlas()`; executa **um único round-trip com o Core** — resolver o `status` (estado + configuração resolvida + Persona ativa) e devolvê-lo ao **renderer** via IPC; renderiza esse snapshot na janela; e encerra limpo (`atlas.shutdown()` + fecho da app). Nenhuma etapa cognitiva, nenhuma Tool, nenhum multi-turno.

---

# Motivação

Todos os gates da Fase 1 estão fechados (SPEC-0029/0030) e o usuário decidiu explicitamente iniciar a Fase 2 (Roadmap l. 190 exige decisão humana — dada). A Fase 2 (`apps/desktop`) é a primeira experiência de usuário além do terminal, prevista desde o `WorkspaceStrategy.md` (`atlas-desktop`) e o `ProjectStructure.md` (`apps/desktop/`), e escopada no PRD ("interação por texto", "Escopo Inicial").

Esta fatia deliberadamente espelha a SPEC-0003: não entrega a experiência completa, apenas **prova o boot da janela contra o Core pelos mesmos contratos públicos que a CLI já usa**, estabelecendo a estrutura física e os limites de segurança (Core só no main process) sobre os quais as fatias 2.1-restante, 2.2, 2.3 e 2.4 serão construídas, cada uma na sua própria SPEC.

---

# Referências

- `docs/04-engineering/Roadmap.md` — Fase 2, item 2.1
- `docs/03-architecture/ProjectStructure.md` (v2.1) — `apps/desktop/` (responsabilidades, "não deve conter lógica cognitiva"), regras de dependência (1, 2, 11)
- `docs/03-architecture/WorkspaceStrategy.md` (v1.1) — `atlas-desktop` → `apps/desktop/`; dependência unidirecional (desktop → core)
- `docs/03-architecture/ModuleCatalog.md` — Input Gateway / Output Gateway (camada Interaction, `apps/*`)
- `docs/02-product/ProductRequirementsDocument.md` — Comunicação (interação por texto), Escopo Inicial
- `docs/00-project/ArchitectureConstitution.md` — Artigo 4 (Core é o único orquestrador; comunicação só por contratos públicos), Artigo 7 (uma única Persona percebida)
- `docs/06-adr/ADR-0003-core-composition-root.md` / `ADR-0004-manual-composition.md` — `createAtlas` como superfície pronta
- `docs/06-adr/ADR-0005-app-typescript-execution.md` — padrão sem `dist/`, TS via `tsx`
- `docs/06-adr/ADR-0006-config-source-precedence.md` — precedência de config (reaproveitada)
- **ADR-0019** (novo, a registrar nesta SPEC) — stack Electron para `apps/desktop` + criação do app
- `implementation/specs/SPEC-0003-cli-foundation.md` (Done) — padrão de referência (casca fina + camada testável + adapters locais)

---

# Escopo

- registrar **ADR-0019** (stack Electron para `apps/desktop`; criação do app) — decisão humana do brainstorming, formalizada. **Correção vinculante do `architecture-reviewer` (gate `Draft → Ready`):** o ADR-0019 **deve** registrar honestamente a **tensão com o Princípio 13** (nenhuma dependência permanente de framework — citado no ADR-0004): Electron é o **framework de runtime permanente** do produto desktop, e adotá-lo é aceitar conscientemente essa exceção. O ADR **não** pode justificar Electron pela analogia com o `tsx` ("dev tooling, não runtime de produto") — a analogia vale só para o *lugar* (`devDependency`, pois o binário é do empacotador), não para o *porquê* da escolha de stack;
- criar `apps/desktop` (`@atlas/desktop`): `package.json` (com script de start via Electron), `tsconfig.json`, `CLAUDE.md`, `README.md`;
- `src/core-bridge.ts`: camada **testável, sem Electron**, que fala com o Core — `resolveStatusSnapshot(configOverride?): Promise<StatusSnapshot>` chama `createAtlas({ config })`, lê `state`/`config`/`persona`, chama `atlas.shutdown()` e devolve um objeto plano serializável (`StatusSnapshot`); é o análogo do `runStatus` da CLI, adaptado para retornar dado (não escrever em stream);
- `src/main.ts`: **casca do main process do Electron** (análoga ao `main.ts` da CLI) — ciclo de vida da app (`app.whenReady`/`window-all-closed`), cria a `BrowserWindow` (com `contextIsolation: true`, `nodeIntegration: false`, `preload`), registra `ipcMain.handle('atlas:status', …)` delegando ao `core-bridge`, e encerra a app;
- `src/preload.js`: ponte segura via `contextBridge.exposeInMainWorld('atlas', { getStatus: () => ipcRenderer.invoke('atlas:status') })` — sem lógica de domínio;
- `src/renderer/index.html` + `src/renderer/renderer.js`: superfície mínima que chama `window.atlas.getStatus()` e pinta o snapshot na janela;
- declarar dependências de workspace `@atlas/contracts: workspace:*` (tipos públicos: `AtlasConfig`, `AtlasPlatform`) e `@atlas/core: workspace:*`; `electron` como `devDependency` (dev tooling de execução, não runtime de produto — coerente com ADR-0005);
- execução sem `dist/`: o main process roda o fonte `.ts` via `tsx` (padrão ADR-0005); preload e renderer ficam em JavaScript plano (sem bundler nesta fatia);
- aprovar o build script do `electron` (download do binário) em `pnpm-workspace.yaml` (`allowBuilds: { electron: true }`) — análogo ao `esbuild` do `tsx` na SPEC-0003;
- ajustar a flat config do ESLint se necessário para o contexto browser do `renderer.js`/`preload.js` (globals `window`/`document`);
- atualizar `CLAUDE.md` raiz (estado do projeto; registrar `apps/desktop` como criado).

---

# Fora do Escopo

Cada item abaixo pertence às fatias 2.1-restante / 2.2-2.4, cada uma sua própria SPEC:

- qualquer comando/etapa cognitiva na janela: `ask`, `respond`, chat visual multi-turno, histórico de sessão (fatia 2.2);
- adapters de GUI completos: `ConfirmPort` via diálogo nativo, superfície de renderização dos `steps` de execução (`renderSteps` visual) — nenhum plano executável é disparado nesta fatia (2.1-restante / 2.2);
- voz — STT, TTS, wake word (fatia 2.3);
- gerência visual de memória (listar/esquecer pela UI); troca de Persona por UI; configuração de `readRoots`/`writeRoots` por UI (fatia 2.4);
- empacotamento e distribuição do app (instalador, binário assinado, `electron-builder`, `dist/`) — Fase 3;
- introdução de bundler para o renderer (Vite/esbuild) ou framework de UI (React etc.) — decisão maior, adiada para a fatia de chat visual quando houver necessidade real;
- promover as interfaces de Input/Output Gateway ou `StatusSnapshot` a `@atlas/contracts` — só quando um contrato for genuinamente compartilhado, via ADR;
- qualquer alteração em `@atlas/contracts` ou `@atlas/core` — a superfície pronta basta; necessidade de mudança nesses packages é motivo para **parar e registrar** (Constituição);
- E2E/harness headless de Electron em CI (Playwright-electron/Spectron) — o boot da janela é validado por smoke manual nesta fatia.

---

# Pré-requisitos

- [SPEC-0002](SPEC-0002-core-bootstrap.md) (Done) — `createAtlas()`.
- [SPEC-0003](SPEC-0003-cli-foundation.md) (Done) — padrão de app sem `dist/` via `tsx` (ADR-0005) e precedência de config (ADR-0006).
- Todos os gates da Fase 1 fechados — SPEC-0029 e SPEC-0030 (Done).
- Decisão humana de iniciar a Fase 2 (dada nesta sessão) e de adotar Electron (ADR-0019, a registrar).

---

# Critérios de Aceitação

- `pnpm install` conclui sem erros, incluindo o download do binário do Electron (build aprovado em `pnpm-workspace.yaml`);
- `pnpm lint` passa sem erros, cobrindo `apps/desktop` (inclusive `renderer.js`/`preload.js` no contexto browser);
- `pnpm typecheck` passa, cobrindo `apps/desktop`;
- `pnpm test` executa e passa, incluindo os testes de `apps/desktop/tests/` (via glob `apps/*/tests/**` já existente no `vitest.config.ts`);
- teste comprova: `resolveStatusSnapshot()` sobre o Core real (in-memory, determinístico) devolve um `StatusSnapshot` com `state === 'ready'`, `logLevel`, `dataDir`, `persona.id`/`persona.name`, e as raízes de permissão resolvidas — objeto plano e serializável por IPC (`JSON.stringify` round-trips sem perda);
- teste comprova: `resolveStatusSnapshot(override)` propaga o override de config ao Core (ex.: `{ logLevel: 'debug' }` ⇒ snapshot com `logLevel: 'debug'`), e propaga `InvalidConfigError` sem capturar (paridade com o `runStatus`/`run` da CLI);
- teste comprova: `resolveStatusSnapshot` chama `atlas.shutdown()` mesmo em caminho de sucesso (o Core não fica pendurado após o round-trip);
- smoke manual (registrado nas Observações): iniciar o app (`pnpm --filter @atlas/desktop start` ou equivalente) abre uma janela exibindo `Atlas: ready` e a config resolvida, e o app encerra limpo ao fechar a janela;
- estrutura corresponde à seção "Arquivos Esperados";
- ADR-0019 registrado (`Status: Accepted`); `CLAUDE.md` raiz atualizado (`apps/desktop` deixa de ser "referenciado mas não criado");
- nenhuma alteração em `@atlas/contracts` nem `@atlas/core`.

---

# Arquivos Esperados

```text
apps/
└── desktop/
    ├── src/
    │   ├── main.ts            # casca do main process (Electron): app lifecycle, BrowserWindow, ipcMain.handle
    │   ├── core-bridge.ts     # testável, sem Electron: createAtlas → StatusSnapshot → shutdown
    │   ├── preload.cjs        # contextBridge: window.atlas.getStatus() (.cjs: package "type":"module" + require('electron'))
    │   └── renderer/
    │       ├── index.html
    │       └── renderer.js    # invoca getStatus() e pinta o snapshot
    ├── tests/
    │   └── core-bridge.test.ts
    ├── CLAUDE.md
    ├── README.md
    ├── package.json
    └── tsconfig.json
```

Modificados: `pnpm-workspace.yaml` (`allowBuilds: electron`), `CLAUDE.md` (raiz), e — se necessário — a flat config do ESLint (globals browser do renderer).

Novos: `docs/06-adr/ADR-0019-desktop-electron-stack.md`.

Essa lista representa uma expectativa e pode sofrer pequenos ajustes durante a implementação.

---

# Componentes Impactados

Camada Interaction do Module Catalog, agora num segundo app (`apps/desktop`):

- Input Gateway / Output Gateway — semente desktop: entrada = evento de abertura da janela; saída = renderização do snapshot na janela (equivalente GUI ao stdout da CLI).

Consome, sem alterar: Core (`createAtlas`), Configuration Service (precedência de config), Persona Service (`atlas.persona`), Lifecycle Manager (`atlas.shutdown`).

---

# Interfaces Necessárias

Locais em `apps/desktop` (não em `@atlas/contracts` — não há segundo consumidor):

```text
StatusSnapshot {
  state: string
  logLevel: string
  dataDir: string
  persona: { id: string; name: string }
  readRoots: string[]
  writeRoots: string[]
}

resolveStatusSnapshot(configOverride?: Partial<AtlasConfig>): Promise<StatusSnapshot>
  // createAtlas({ config }) → lê state/config/persona → shutdown → snapshot plano
```

Canal IPC (nome estável, semente para futuros canais):

```text
main:     ipcMain.handle('atlas:status', () => resolveStatusSnapshot())
preload:  contextBridge.exposeInMainWorld('atlas', { getStatus: () => ipcRenderer.invoke('atlas:status') })
renderer: const snapshot = await window.atlas.getStatus()
```

Nenhuma interface nova em `@atlas/contracts`.

---

# Fluxo Esperado

```text
electron src/main.ts (via tsx)
  → app.whenReady()
    → new BrowserWindow({ webPreferences: { preload, contextIsolation: true, nodeIntegration: false } })
    → window.loadFile('src/renderer/index.html')
    → ipcMain.handle('atlas:status', () => resolveStatusSnapshot())

renderer.js (na janela)
  → window.atlas.getStatus()            (contextBridge → ipcRenderer.invoke)
    → [main] resolveStatusSnapshot()
        → createAtlas({ config })
        → { state, config, persona } → StatusSnapshot
        → atlas.shutdown()
    → devolve StatusSnapshot
  → pinta "Atlas: ready" + config resolvida no DOM

fechar janela → window-all-closed → app.quit()
```

Regras (para remover ambiguidade):

- o Core vive **exclusivamente no main process**; o renderer nunca importa `@atlas/core` nem `@atlas/contracts` (Artigo 4 / regra de dependência; e segurança Electron: `contextIsolation` ligado, `nodeIntegration` desligado);
- `resolveStatusSnapshot` faz `createAtlas` **e** `shutdown` no mesmo round-trip — não mantém a plataforma viva entre chamadas nesta fatia;
- o override de config nesta fatia é vazio/`{}` por default; a resolução de flags/env de linha de comando para o app fica para quando o app precisar (não há CLI parsing aqui).

---

# Estratégia de Implementação

1. registrar ADR-0019 (Electron + criação de `apps/desktop`);
2. criar o esqueleto de `apps/desktop` (`package.json`, `tsconfig.json`, deps `@atlas/core`/`@atlas/contracts`, `electron` devDep); aprovar `electron` em `allowBuilds`;
3. `core-bridge.ts` por TDD: `resolveStatusSnapshot` sobre o Core real — snapshot correto, override propagado, `InvalidConfigError` propagada, `shutdown` chamado (nenhum Electron nos testes);
4. `main.ts` como casca fina do Electron: janela + `ipcMain.handle` delegando ao bridge; sem lógica de domínio;
5. `preload.js` (contextBridge) + `renderer/index.html` + `renderer/renderer.js` (pinta o snapshot);
6. ajustar ESLint (globals browser do renderer) se o lint acusar; validar `pnpm lint`/`typecheck`/`test`;
7. smoke manual do app real (janela abre, mostra `ready`, encerra limpo) e registrar o resultado;
8. atualizar `CLAUDE.md` raiz; validar todos os critérios de aceitação.

---

# Estratégia de Testes

- testes unitários próximos ao app (`apps/desktop/tests/`), rodando sob o Vitest já configurado (`apps/*/tests/**`), **sem Electron** — a fronteira testável é o `core-bridge`, exatamente como a CLI testa `gateway`/`commands` sem tocar o `process.exit` do `main.ts`;
- **core-bridge**: `resolveStatusSnapshot()` devolve snapshot com `state: 'ready'` + campos de config/persona; snapshot é serializável (`JSON.parse(JSON.stringify(snapshot))` idêntico); override de config propagado ao Core; `InvalidConfigError` propagada; `shutdown` chamado no caminho feliz (spy/observação sobre a plataforma);
- sem mocks do Core: usa-se `createAtlas` real (in-memory, determinístico) — [ADR-0004](../06-adr/ADR-0004-manual-composition.md);
- `main.ts`/`preload.js`/`renderer.js` (camada Electron) **não** são unit-testados nesta fatia — validação por smoke manual (atrito de teste do Electron; harness headless é Fora do Escopo).

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando;
- documentação atualizada;
- arquitetura preservada;
- revisão concluída;
- lições aprendidas registradas em `implementation/LESSONS_LEARNED.md`.

A sincronização das docs vivas (`CLAUDE.md` raiz, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) é passo de fecho (`doc-sync`), não do implementador; o implementador toca a doc específica da própria SPEC (o arquivo da SPEC, o ADR-0019, o `CLAUDE.md` de `apps/desktop`).

---

# Restrições

- Não criar novos packages nem módulos; o único artefato novo de código é o app `apps/desktop`. O app é fino: nenhuma lógica cognitiva, de memória ou de coordenação de Skills (ProjectStructure: "a aplicação desktop não deve conter lógica cognitiva, regras de memória ou coordenação de Skills").
- Consumir o Core **só** pelos contratos públicos (`createAtlas`, `AtlasPlatform`, `AtlasConfig`) — nunca internals de package (Artigo 4). Imports entre workspaces exclusivamente por nome `@atlas/*` declarado no `package.json`; sem path aliases.
- O Core vive só no main process; o renderer não importa código de `packages/*`. `contextIsolation: true`, `nodeIntegration: false` — Artigo 4 e boas práticas de segurança do Electron.
- Não alterar `@atlas/contracts` nem `@atlas/core`. Se a implementação sugerir que uma mudança neles é necessária, **parar e registrar** antes de prosseguir (Constituição).
- Nada de Planner/Runtime/Permission Service vazando para a UI — uma única Persona percebida (Artigo 7). Nesta fatia isso é trivial (só `status`), mas o limite fica estabelecido.
- Sem `dist/`: main process roda o fonte `.ts` via `tsx` (ADR-0005). `electron` é dev tooling de execução, não dependência de runtime do produto.
- `StatusSnapshot` e a semente de IPC ficam locais em `apps/desktop`; promoção a `@atlas/contracts` só com um segundo consumidor real, via ADR.

---

# Observações

**Atrito de execução validado — resolvido sem `dist`/bundler (registrado como previsto pela SPEC).** `tsx` como flag direta do binário Electron **não funciona**, por dois motivos distintos, ambos confirmados na prática:

1. `electron --import tsx ./src/main.ts` (forma com espaço) falha silenciosamente: o parser de argv do Electron trata `tsx` como o *app path* e `./src/main.ts` vira argumento da app — nada carrega, sem erro visível.
2. Mesmo com `--import=tsx` (forma com `=`, que resolve o problema 1), o hook de remapeamento `.js`→`.ts` do `tsx` em imports relativos **não se propaga** para o carregamento do processo principal do Electron — falha com `ERR_MODULE_NOT_FOUND` ao resolver `./model-gateway.js` dentro de `@atlas/model-gateway` (reproduzido isoladamente, inclusive para `import('@atlas/model-gateway')` direto; confirmado ausente sob `ELECTRON_RUN_AS_NODE=1`, onde o mesmo hook funciona normalmente — isolando o problema ao modo "app" do Electron, não ao `tsx` nem ao Node embutido).

**Correção que preserva o princípio sem-`dist`:** registrar o hook via variável de ambiente em vez de flag do binário — `NODE_OPTIONS=--import=tsx electron ./src/main.ts` (script `start` do `package.json`, `apps/desktop/CLAUDE.md`). Validado ponta a ponta: o main process carrega `@atlas/core` e toda a árvore transitiva de packages com a convenção `.js`→`.ts` sem erro de módulo, e chega a `app.whenReady()` sem exceção. Nenhum passo de build foi introduzido.

**Smoke manual — parcialmente executado, confirmação visual pendente de sessão gráfica real.** O ambiente de automação usado nesta implementação não tem acesso ao WindowServer: `app.whenReady()` nunca resolve nesse shell sandboxed (mesmo com `dangerouslyDisableSandbox`), e `screencapture` confirma "could not create image from display" — sem display anexado ao processo. Validado programaticamente até a criação da janela: zero erro de resolução de módulo, `ipcMain.handle('atlas:status', …)` registrado, `resolveStatusSnapshot()` executado com sucesso contra o Core real dentro do processo Electron (via um script de verificação equivalente ao `main.ts`), `app.whenReady()` invocado sem exceção. **Confirmação visual final: FEITA e OK** — o usuário executou `pnpm --filter @atlas/desktop start` em sessão gráfica real e confirmou que a janela abre exibindo `Atlas: ready` + a config resolvida e encerra limpo ao fechar. Critério de Aceitação do smoke manual (l. 135) atendido.

O renderer roda em contexto Chromium (não-Node), por isso `renderer.js` fica em JavaScript plano; `preload.cjs` (não `.js` — ver `apps/desktop/CLAUDE.md`) usa CommonJS porque o preload do Electron chama `require('electron')`, e o `package.json` do app é `"type": "module"` — `.cjs` evita a ambiguidade sem exigir um `package.json` aninhado.

**Persona percebida vs. diagnóstico:** exibir `logLevel`/`dataDir`/raízes na janela é uma tela de diagnóstico (o análogo do `atlas status`), não a experiência de usuário normal — não fere o Artigo 7, do mesmo modo que `atlas status` não fere. A experiência conversacional de Persona única começa na fatia 2.2.

**CI:** a suíte de `apps/desktop` que roda em CI é apenas a do `core-bridge` (Vitest, sem Electron). O passo `pnpm install --frozen-lockfile` do CI baixará o binário do Electron (build aprovado em `allowBuilds`); o lançamento headless da janela **não** é executado em CI nesta fatia. Nenhum job novo de CI é necessário — lint/typecheck/test/format já cobrem o novo app por recursão do workspace e pelos globs do Vitest.

---

# Checklist para IA

Antes de implementar:

- ler documentação referenciada (Roadmap 2.1, ProjectStructure `apps/desktop`, ADR-0003/0004/0005, SPEC-0003);
- compreender objetivo (round-trip mínimo, espelho da SPEC-0003);
- confirmar que ADR-0019 está registrado;
- validar dependências (Fase 1 fechada, SPEC-0002/0003 Done).

Durante implementação:

- manter o app fino (nenhuma lógica do Core);
- Core só no main process; renderer isolado;
- respeitar arquitetura (contratos públicos, Artigos 4 e 7);
- manter simplicidade (sem bundler, sem framework de UI).

Após implementação:

- executar testes;
- smoke manual do app real;
- validar critérios de aceitação;
- registrar lições aprendidas;
- registrar conclusão.

---

# Decisões de design

> Decisões tomadas pelo `spec-drafter` (Emenda v1.1), em formato de veto. Quem as ataca é o `architecture-reviewer` no gate `Draft → Ready`.

**1. Perfil `completo`.**

- **Decisão**: classificar a SPEC como `completo`.
- **Porquê**: cria um app novo (`apps/desktop` — decisão estrutural) e exige um ADR novo (ADR-0019, stack Electron) — dois gatilhos de escalação da Emenda v1.1, cada um por si já reprova o teste `micro`.
- **Alternativa descartada**: `micro` — falharia em múltiplas condições (não é aditiva a um package existente; exige ADR; é decisão arquitetural nova); classificar micro só faria a SPEC cair no pipeline completo depois, sem ganho.

**2. Round-trip mínimo = `status` (não `ask`).**

- **Decisão**: o único round-trip com o Core desta fatia resolve e renderiza o `status` (estado + config + Persona), não um `ask`.
- **Porquê**: espelha exatamente a SPEC-0003 (que provou o Core com `atlas status`, sem etapa cognitiva); é determinístico, não depende do model-gateway e não levanta questão de Persona percebida — mais simples e mais transparente para uma fatia de fundação.
- **Alternativa descartada**: `ask` simples — arrastaria o model-gateway e a etapa cognitiva para uma fatia cujo objetivo é só provar o boot da janela; adia complexidade sem necessidade (o `ask` visual pertence à fatia 2.2).

**3. Estrutura de pastas: camada `core-bridge` testável separada da camada Electron.**

- **Decisão**: isolar a lógica que fala com o Core num `core-bridge.ts` sem Electron (testável no Vitest), deixando `main.ts` como casca fina do Electron — espelho do par `commands`/`gateway` × `main.ts` da CLI.
- **Porquê**: contorna o atrito de teste do Electron colocando toda a lógica verificável fora do runtime gráfico; segue o padrão já validado da SPEC-0003 (autor≠verificador continua possível sem harness gráfico) — mais sustentável e testável.
- **Alternativa descartada**: pôr o `createAtlas` direto no `main.ts` do Electron — tornaria a única lógica de valor não-testável sem um harness de Electron, contra "mais testável/sustentável".

**4. IPC via `ipcMain.handle`/`invoke` com `contextBridge` e isolamento ligado.**

- **Decisão**: main↔renderer por `ipcMain.handle('atlas:status')` + preload com `contextBridge.exposeInMainWorld`, com `contextIsolation: true` e `nodeIntegration: false`.
- **Porquê**: mantém o Core exclusivamente no main process (Artigo 4 — Core é o único orquestrador; renderer nunca toca `packages/*`) e adota o default seguro recomendado do Electron — mais modular e mais seguro.
- **Alternativa descartada**: `nodeIntegration: true` no renderer para `require('@atlas/core')` direto (ou `@electron/remote`) — colocaria o Core no renderer, quebrando o limite arquitetural e as boas práticas de segurança do Electron.

**5. Renderer/preload em JavaScript plano; main process em TS via `tsx`; sem bundler.**

- **Decisão**: `renderer.js`/`preload.js` são JavaScript plano; o main process roda `.ts` via `tsx` (ADR-0005); nenhum bundler é introduzido.
- **Porquê**: o renderer roda em contexto Chromium (não-Node), onde o `tsx` não transforma; a lógica tipada e testada mora no `core-bridge` (Node/TS), e o renderer só pinta uma string — introduzir um bundler seria uma decisão arquitetural maior e prematura. Preserva o princípio sem-`dist` — mais simples.
- **Alternativa descartada**: adotar Vite/esbuild + framework de UI já nesta fatia — cerimônia desproporcional para pintar um snapshot; a decisão de bundler pertence à fatia de chat visual (2.2), quando houver necessidade real.

**6. Testar só o `core-bridge`; janela por smoke manual.**

- **Decisão**: unit-testar apenas o `core-bridge` (sem Electron); validar o boot da janela por smoke manual documentado; nenhum harness E2E de Electron.
- **Porquê**: concentra a cobertura automatizada onde há lógica (o round-trip com o Core) e evita o custo/instabilidade de um harness gráfico numa fatia de fundação — mais simples e sustentável.
- **Alternativa descartada**: harness headless (Playwright-electron/Spectron) em CI — peso desproporcional agora; fica reservado para quando a UI tiver comportamento próprio a testar.

**7. CI sem job novo; aprovar build do `electron` em `allowBuilds`.**

- **Decisão**: não adicionar job de CI; aprovar `electron: true` em `pnpm-workspace.yaml` (download do binário no `pnpm install`), deixando lint/typecheck/test/format cobrirem o app por recursão do workspace e globs do Vitest já existentes.
- **Porquê**: os globs `apps/*/tests/**` (ajustados na SPEC-0003) e os comandos recursivos já alcançam o novo app; a única fricção real é o build script do Electron, resolvido do mesmo jeito que o `esbuild` do `tsx` foi na SPEC-0003 — mais simples, menos superfície de CI.
- **Alternativa descartada**: job de CI dedicado com launch headless da janela — traria flutuação de Electron ao CI para validar algo (o `core-bridge`) que já roda sob Vitest sem Electron.

**8. Prioridade `High`.**

- **Decisão**: prioridade `High`.
- **Porquê**: é a fatia que abre a Fase 2 inteira — nenhuma outra fatia desktop (2.1-restante, 2.2-2.4) pode começar sem esta fundação; paridade com a SPEC-0003 (também `High`, por abrir a interface CLI). Não é `Critical` porque a CLI já cobre o MVP funcional hoje, sem regressão.
- **Alternativa descartada**: `Medium` — subestimaria o efeito de desbloqueio de fase inteira; `Critical` — reservado a correções/segurança bloqueantes, que não é o caso.

---

# Resultado Esperado

O Atlas passa a ter uma segunda interface executável: o app desktop `@atlas/desktop` (Electron) abre uma janela, e — pelos mesmos contratos públicos que a CLI usa — o main process sobe a plataforma via `createAtlas()`, resolve o `status` e o entrega ao renderer por IPC, que o pinta na tela; o app encerra limpo. A lógica que fala com o Core está isolada num `core-bridge` testável (Vitest, sem Electron), o Core permanece exclusivamente no main process com `contextIsolation` ligado, o padrão sem-`dist` é estendido ao main process via `tsx`, e a stack Electron fica formalizada no ADR-0019. É o equivalente desktop da SPEC-0003: a fundação sobre a qual as fatias 2.1-restante, 2.2, 2.3 e 2.4 serão construídas, cada uma na sua própria SPEC.
