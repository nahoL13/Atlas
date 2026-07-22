# @atlas/desktop

Primeira interface gráfica do Atlas (SPEC-0031), sobre Electron ([ADR-0019](../../docs/06-adr/ADR-0019-desktop-electron-stack.md)) — equivalente desktop da SPEC-0003/`@atlas/cli`.

- Prova um único round-trip com o Core: `status` (estado + config resolvida + Persona ativa), não `ask`/etapa cognitiva — espelha exatamente o que a SPEC-0003 fez no terminal.
- **Fronteira dura (Artigo 4 + segurança Electron):** o Core (`@atlas/core`/`@atlas/contracts`) vive **só** no main process (`src/main.ts`, `src/core-bridge.ts`). O renderer (`src/renderer/*.js`) **nunca** importa `packages/*` — fala com o main exclusivamente por IPC (`window.atlas.getStatus()` → `contextBridge` → `ipcRenderer.invoke('atlas:status')` → `ipcMain.handle`). `BrowserWindow` roda com `contextIsolation: true` e `nodeIntegration: false`.
- `src/core-bridge.ts` é a camada testável sem Electron (análoga a `commands/status.ts` da CLI): `resolveStatusSnapshot(configOverride?)` chama `createAtlas({ config })`, lê `state`/`config`/`persona`, chama `atlas.shutdown()` (sempre, inclusive sucesso — `finally`) e devolve um `StatusSnapshot` plano, serializável por IPC. Não mantém a plataforma viva entre chamadas nesta fatia — cada round-trip sobe e desliga o Core.
- `StatusSnapshot` e o canal `'atlas:status'` são **locais** a este app (não `@atlas/contracts` — não há segundo consumidor); promoção só com um 2º consumidor real, via ADR.
- `src/main.ts` é casca fina: ciclo de vida da app (`whenReady`/`window-all-closed`/`activate`), cria a `BrowserWindow`, registra `ipcMain.handle('atlas:status', () => resolveStatusSnapshot())`. Nenhuma lógica de domínio.
- **`src/preload.cjs` é CommonJS (extensão `.cjs`), não `.js`.** O `package.json` do app é `"type": "module"`; um `preload.js` puro seria interpretado como ESM pela árvore de resolução de módulos mais próxima, mas o preload do Electron usa `require('electron')` (CommonJS) — `.cjs` força o formato certo sem depender de um `package.json` aninhado. `renderer/renderer.js` não tem esse problema (roda como `<script>` clássico no Chromium, fora da resolução de módulos do Node).

## Atrito de execução validado (ADR-0005 estendido a Electron)

O mecanismo `tsx --import ./src/main.ts` (equivalente ao `bin` da CLI) **não funciona em Electron**, por duas razões distintas, ambas verificadas na prática:

1. **`electron --import tsx ./src/main.ts` (forma com espaço) falha silenciosamente.** O parser de argv do Electron trata `tsx` como o *app path* (não como valor de `--import`), e `./src/main.ts` vira argumento da app — nada carrega, sem erro visível. Correção: **`--import=tsx`** (forma com `=`), que o parser do Electron liga corretamente à flag.
2. **Mesmo com `--import=tsx` passado como flag do binário Electron, o hook de resolução do `tsx` (remapeamento `.js` → `.ts` em imports relativos, usado em todo o repositório) não se propaga para o carregamento do processo principal da app** — falha com `ERR_MODULE_NOT_FOUND` ao resolver imports internos como `./model-gateway.js` dentro de `@atlas/model-gateway` (reproduzido também com `@atlas/model-gateway` importado diretamente, e confirmado ausente sob `ELECTRON_RUN_AS_NODE=1`, onde o mesmo hook funciona normalmente). É uma particularidade de como o Electron inicializa o loader de módulos do processo principal, não um bug do `tsx` nem do padrão `.js`→`.ts` em si.
3. **Correção que resolve os dois pontos sem introduzir build/`dist`:** registrar o hook via variável de ambiente, não via flag do binário — `NODE_OPTIONS=--import=tsx electron ./src/main.ts` (script `start` do `package.json`). Validado ponta a ponta: o processo principal carrega `@atlas/core` (e toda a árvore transitiva de packages com imports `.js`) sem erro, chega a `app.whenReady()` sem exceção.

**Smoke manual (execução real da janela):** o ambiente de automação usado para implementar esta SPEC não tem acesso ao WindowServer (`app.whenReady()` nunca resolve nesse shell sandboxed; `screencapture` confirma "could not create image from display" — sem display anexado). A cadeia de carregamento foi validada programaticamente até a criação da janela (zero erro de módulo, `ipcMain.handle` registrado, `app.whenReady()` invocado sem exceção) — falta a confirmação visual final (`Atlas: ready` renderizado na tela, encerramento limpo ao fechar), que exige uma sessão desktop real e deve ser feita manualmente por quem tiver acesso a um ambiente gráfico antes de fechar esta SPEC.

## CI

Só a suíte de `apps/desktop/tests` (Vitest, sem Electron) roda em CI — a janela real não é lançada em CI. `pnpm install --frozen-lockfile` baixa o binário do Electron (`allowBuilds: electron: true` em `pnpm-workspace.yaml`).
