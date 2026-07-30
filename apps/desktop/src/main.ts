import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn as nodeSpawn } from 'node:child_process';
import { access, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import {
  closeChatSession,
  createPersona,
  deletePersona,
  describePersona,
  forgetFact,
  listPersonas,
  openChatSession,
  resolveAskSnapshot,
  resolveMemorySnapshot,
  resolveStatusSnapshot,
  selectPermissionRoots,
  selectPersona,
  sendChatTurn,
  updatePersona,
} from './core-bridge.js';
import type { SessionId, PersonaInput } from '@atlas/contracts';
import type { PermissionRoots } from './core-bridge.js';
import { createDialogConfirmPort } from './confirm-port.js';
import { createGrantConfirmDialog } from './permission-grant-dialog.js';
import { createPersonaDeleteDialog } from './persona-delete-dialog.js';
import { createPiperTts } from './piper-tts.js';
import type { PiperFsPort, PiperPaths, SpawnPiper } from './piper-tts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ConfirmPort de diálogo nativo: `dialog.showMessageBox` só existe aqui, no
// main process — `confirm-port.ts`/`core-bridge.ts` seguem livres de import
// de Electron (testáveis no Vitest).
const confirm = createDialogConfirmPort({
  showMessageBox: (options) => dialog.showMessageBox(options),
});

// GrantConfirmPort de concessão de política de escrita (SPEC-0038, D11):
// diálogo dedicado, distinto do `confirm` de ação pontual acima — mesma
// razão de `dialog.showMessageBox` só existir no main process.
const confirmGrant = createGrantConfirmDialog({
  showMessageBox: (options) => dialog.showMessageBox(options),
});

// PersonaDeleteConfirmPort de consentimento de remoção de Persona
// (SPEC-0039, Decisão D14): diálogo dedicado, distinto dos dois acima —
// mesma razão de `dialog.showMessageBox` só existir no main process.
const confirmDelete = createPersonaDeleteDialog({
  showMessageBox: (options) => dialog.showMessageBox(options),
});

// Piper (SPEC-0040, ADR-0021): motor de TTS neural local, subprocesso de
// longa duração só no main process — `piper-tts.ts` nunca importa
// `electron` nem conhece caminho real algum (portas injetadas aqui).

/** Porta de IO real sobre `node:fs/promises` — sem disco real nos testes de `piper-tts.ts`. */
function nodePiperFsPort(): PiperFsPort {
  return {
    listDir: (dir) => readdir(dir),
    readText: (path) => readFile(path, 'utf8'),
    readBytes: async (path) => new Uint8Array(await readFile(path)),
    remove: (path) => rm(path, { force: true }),
    exists: async (path) => {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Sobe o binário Piper sempre por argv array (nunca `shell: true`, D12) —
 * mesmo padrão de `packages/tools/src/git-port.ts`. `stdin`/`stdout` em modo
 * texto por linha (D4); `stderr` é drenado e ignorado (nunca sinal de
 * conclusão nem erro fatal).
 */
function nodeSpawnPiper(): SpawnPiper {
  return (command, args) => {
    const child = nodeSpawn(command, [...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdoutListeners: Array<(line: string) => void> = [];
    const exitListeners: Array<(code: number | null) => void> = [];

    if (child.stdout !== null) {
      const rl = createInterface({ input: child.stdout });
      rl.on('line', (line) => {
        for (const cb of stdoutListeners) cb(line);
      });
    }
    child.stderr?.resume();
    child.on('exit', (code) => {
      for (const cb of exitListeners) cb(code);
    });

    return {
      writeLine: (line) => {
        child.stdin?.write(`${line}\n`);
      },
      onStdoutLine: (cb) => {
        stdoutListeners.push(cb);
      },
      onExit: (cb) => {
        exitListeners.push(cb);
      },
      kill: () => {
        child.kill();
      },
    };
  };
}

/** Nome do binário Piper por plataforma (D4: `piper`/`piper.exe`). */
function piperBinaryName(): string {
  return process.platform === 'win32' ? 'piper.exe' : 'piper';
}

/**
 * Resolução dos recursos em três níveis (D10): `ATLAS_PIPER_DIR` →
 * `process.resourcesPath/piper` quando empacotado → `resources/piper` em
 * desenvolvimento. Nenhum download, em runtime ou não — assets fora do git.
 */
function resolvePiperDir(): string {
  const envDir = process.env['ATLAS_PIPER_DIR'];
  if (envDir !== undefined && envDir.trim() !== '') {
    return envDir;
  }
  if (app.isPackaged) {
    return join(process.resourcesPath, 'piper');
  }
  return join(__dirname, '..', 'resources', 'piper');
}

function resolvePiperPaths(): PiperPaths {
  const dir = resolvePiperDir();
  return { binary: join(dir, piperBinaryName()), modelsDir: join(dir, 'voices') };
}

const piperTts = createPiperTts({
  fs: nodePiperFsPort(),
  spawn: nodeSpawnPiper(),
  tmpDir: () => tmpdir(),
  randomId: () => randomUUID(),
  paths: resolvePiperPaths(),
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

ipcMain.handle('atlas:persona:describe', (_event, id: string) => describePersona(id));
ipcMain.handle('atlas:persona:create', (_event, input: PersonaInput) => createPersona(input));
ipcMain.handle('atlas:persona:update', async (_event, id: string, input: PersonaInput) => {
  const mutation = await updatePersona(id, input);
  // Mesmo tratamento do handler de 'atlas:persona:select': nenhuma sessão
  // encerrada por `updatePersona` deve ser reencerrada no teardown de
  // fechamento da app.
  for (const session of mutation.closedSessions) {
    openChatSessionIds.delete(session);
  }
  return mutation;
});
ipcMain.handle('atlas:persona:delete', (_event, id: string) =>
  deletePersona(id, { confirmDelete }),
);

ipcMain.handle('atlas:tts:voices', () => piperTts.listVoices());
ipcMain.handle('atlas:tts:speak', (_event, request: { text: string; voiceURI: string }) =>
  piperTts.synthesize(request.text, request.voiceURI),
);
ipcMain.handle('atlas:tts:cancel', () => {
  piperTts.cancel();
});
// SPEC-0041: expõe `PiperTts.isAvailable()` (já existia, nunca exposto ao
// renderer) — a única condição que governa a política de superfície
// Piper-only (`isPiperOnlyMode`, `src/speech-output.ts`).
ipcMain.handle('atlas:tts:available', () => piperTts.isAvailable());

ipcMain.handle('atlas:permissions:select', async (_event, roots: PermissionRoots) => {
  const selection = await selectPermissionRoots(roots, { confirmGrant });
  // Mesmo tratamento do handler de 'atlas:persona:select': nenhuma sessão
  // encerrada pela aplicação de permissões deve ser reencerrada no
  // teardown de fechamento da app.
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
  void Promise.all([closeAllChatSessions(), piperTts.shutdown()]).finally(() => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
});

app.on('before-quit', () => {
  void closeAllChatSessions();
  void piperTts.shutdown();
});
