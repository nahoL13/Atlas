# @atlas/desktop

Interface Electron do Atlas. O Core vive apenas no main process; o renderer é um `<script>` clássico e fala com ele somente por IPC. Preserve `contextIsolation: true`, `nodeIntegration: false` e a regra de que `src/core-bridge.ts` concentra a lógica testável sem Electron.

## Execução e verificação

- Inicie com `pnpm --filter @atlas/desktop start`; o main usa `NODE_OPTIONS=--import=tsx electron ./src/main.ts` (não gere `dist/`).
- Testes do app usam Vitest e o harness jsdom em `tests/helpers/renderer-harness.ts`; execute os quatro gates da raiz para fechamento.
- `preload.cjs` é CommonJS por necessidade do Electron; mantenha a extensão `.cjs`.

## Fronteiras e estado de sessão

- `core-bridge.ts` sobe o Core e controla sessões, Persona, permissões, rede, dependências e modelos. Seleções de Persona, permissões e rede são efêmeras; nunca persistem por esta camada.
- Uma operação de Core por vez: `ask`, turno de chat e mudanças de política usam as guardas já existentes. Cancelar é desistência local, não cancelamento cooperativo do Core; sessões abandonadas permanecem em quarentena até assentar.
- O renderer tem fontes únicas para `disabled`/`hidden`. Novo gesto deve participar das guardas de `chatTurnInFlight`, `askInFlight`, `micBusy()` e, quando aplicável, da aplicação de política.

## Portas de consentimento e diálogos (SPEC-0065)

As quatro portas continuam distintas e fail-closed: `confirm-port.ts`, `permission-grant-dialog.ts`, `persona-delete-dialog.ts` e `network-grant-dialog.ts`. Somente o main importa Electron e constrói **um** `ShowMessageBox` por `createParentedShowMessageBox` (`dialog-parent.ts`): a cada chamada, ele parenta o diálogo à primeira `BrowserWindow` não destruída, visível, não minimizada e focada, ou usa o fallback sem pai. Durante hands-free ativo, sempre usa o fallback para preservar o freio do ADR-0023.

`window.atlas.handsFree.setActive(boolean)` é IPC local e efêmero. O renderer publica `true` antes de ativar hands-free; até o ACK, bloqueia toggle, chat, ask e microfone manual. Após ACK, revalida estado, operações, microfone e disponibilidade antes de entrar em `arming`; se a ativação ficou inválida, publica `false` e não captura. Toda saída de estado ativo também publica `false`; falha de IPC é capturada e conserva o main no fallback sem pai. Não use `getFocusedWindow()`, `restore()`, `show()` ou foco forçado.

## Voz e hands-free

- TTS: Piper local é preferido quando disponível; Web Speech local é fallback fail-closed. `voiceURI` pode ser `piper:<id>`; preferências indisponíveis por ambiente são preservadas como opção retida.
- STT: `whisper.cpp` local recebe áudio por push-to-talk; transcrição só preenche o campo. `media-permission.ts` concede áudio apenas dentro da janela explícita de captura.
- Hands-free usa Silero VAD WASM, nove estados e o freio sempre alcançável. `hands-free.ts` segue puro; sua réplica no renderer permanece protegida pelo gate de paridade.

## Dependências e painel Sistema

O desktop inicia Ollama por repouso (`ATLAS_AUTO_START_OLLAMA=false` desliga), pode iniciar explicitamente um container de busca e oferece instalação assistida para o catálogo fixo de modelos. O `DependencyManager` continua fora do ciclo de `createAtlas`; watchdogs de `@atlas/core` limitam suas operações. O painel Sistema apenas observa/polling e não cria canal de push.

## Smoke humano pendente

O ambiente automatizado não possui WindowServer, microfone ou binários/recursos de áudio reais. Permanecem pendentes o smoke de áudio/hands-free e, pela SPEC-0065, a confirmação visual dos diálogos nativos: parentado com janela focada fora do hands-free; independente em hands-free, janela oculta/minimizada/sem foco e apresentações concorrentes. Não registre esses cenários como aprovados sem execução humana real.

## Próximos candidatos

Canal de push para trabalho abandonado, barge-in, fallback de energia do VAD, wake word (ADR novo), seleção de modelo em runtime (ADR), cancelamento cooperativo no Runtime/Task Manager (ADR) e teto de parede único de `ensure()`. Estado detalhado: `docs/05-context/PLATFORM_STATE.md`; histórico: `CLAUDE-ARCHIVE.md` e SPECs.
