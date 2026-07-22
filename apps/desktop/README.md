# @atlas/desktop

Primeira interface gráfica do Atlas (SPEC-0031), sobre Electron ([ADR-0019](../../docs/06-adr/ADR-0019-desktop-electron-stack.md)).

## Uso

```bash
pnpm --filter @atlas/desktop start
```

Abre uma janela que sobe o Core (`createAtlas()`), resolve o `status` (estado + config resolvida + Persona ativa), entrega o snapshot ao renderer por IPC, e o pinta na tela. Fecha a janela → encerra a app.

## Execução sem `dist/`

O main process (`src/main.ts`) roda o fonte `.ts` diretamente, via o hook ESM do `tsx` registrado com `NODE_OPTIONS=--import=tsx` (ADR-0005 estendido a Electron — ver `CLAUDE.md` deste app para o atrito de mecanismo encontrado). `preload.cjs`/`renderer/renderer.js` ficam em JavaScript plano — o renderer roda em contexto Chromium (não-Node), fora do alcance do `tsx`.

## Estrutura

- `src/core-bridge.ts` — camada testável, sem Electron: `resolveStatusSnapshot()` fala com o Core.
- `src/main.ts` — casca do main process do Electron: janela + IPC, sem lógica de domínio.
- `src/preload.cjs` — ponte segura (`contextBridge`) entre main e renderer.
- `src/renderer/` — HTML + JS plano que pinta o snapshot na janela.

## Testes

```bash
pnpm exec vitest run apps/desktop/tests
```

Cobre só o `core-bridge` (sem Electron). O boot da janela é validado por smoke manual — ver `CLAUDE.md`.
