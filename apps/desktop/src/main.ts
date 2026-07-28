import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import {
  closeChatSession,
  forgetFact,
  listPersonas,
  openChatSession,
  resolveAskSnapshot,
  resolveMemorySnapshot,
  resolveStatusSnapshot,
  selectPersona,
  sendChatTurn,
} from './core-bridge.js';
import type { SessionId } from '@atlas/contracts';
import { createDialogConfirmPort } from './confirm-port.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ConfirmPort de diálogo nativo: `dialog.showMessageBox` só existe aqui, no
// main process — `confirm-port.ts`/`core-bridge.ts` seguem livres de import
// de Electron (testáveis no Vitest).
const confirm = createDialogConfirmPort({
  showMessageBox: (options) => dialog.showMessageBox(options),
});

function createWindow(): void {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void window.loadFile(join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('atlas:status', () => resolveStatusSnapshot());
ipcMain.handle('atlas:ask', (_event, objective: string) =>
  resolveAskSnapshot(objective, { confirm }),
);

ipcMain.handle('atlas:memory:list', () => resolveMemorySnapshot());
ipcMain.handle('atlas:memory:forget', (_event, id: string) => forgetFact(id));

ipcMain.handle('atlas:persona:list', () => listPersonas());
ipcMain.handle('atlas:persona:select', async (_event, id: string) => {
  const selection = await selectPersona(id);
  // Sincroniza o rastreio de teardown desta janela com as sessões que
  // `selectPersona` encerrou (D5): nenhuma delas deve ser reencerrada no
  // desligamento da app.
  for (const session of selection.closedSessions) {
    openChatSessionIds.delete(session);
  }
  return selection;
});

// Rastreia as sessões de chat abertas por esta janela só para o teardown no
// desligamento da app — o registro que efetivamente segura o Core vivo é o
// mapa interno de `core-bridge.ts`.
const openChatSessionIds = new Set<SessionId>();

ipcMain.handle('atlas:chat:open', async () => {
  const session = await openChatSession({ confirm });
  openChatSessionIds.add(session);
  return session;
});
ipcMain.handle('atlas:chat:send', (_event, session: SessionId, input: string) =>
  sendChatTurn(session, input),
);
ipcMain.handle('atlas:chat:close', async (_event, session: SessionId) => {
  openChatSessionIds.delete(session);
  await closeChatSession(session);
});

/**
 * Teardown das sessões de chat vivas no desligamento da app (nenhum Core
 * órfão) — tolerante a sessões já encerradas/inexistentes.
 */
async function closeAllChatSessions(): Promise<void> {
  const sessions = [...openChatSessionIds];
  openChatSessionIds.clear();
  for (const session of sessions) {
    try {
      await closeChatSession(session);
    } catch {
      // já encerrada/desconhecida — nada a fazer.
    }
  }
}

void app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  void closeAllChatSessions().finally(() => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
});

app.on('before-quit', () => {
  void closeAllChatSessions();
});
