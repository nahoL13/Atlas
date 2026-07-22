import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { resolveAskSnapshot, resolveStatusSnapshot } from './core-bridge.js';
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

void app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
