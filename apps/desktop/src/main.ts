import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn as nodeSpawn } from 'node:child_process';
import { accessSync } from 'node:fs';
import { access, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import {
  cancelInFlightOperation,
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
import { createCaptureWindow, decideMediaPermission } from './media-permission.js';
import { createSttEngine } from './stt-engine.js';
import type { SttProcess, SpawnStt, SttTranscribeInput } from './stt-engine.js';
import { createVadResources } from './vad-resources.js';

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

// whisper.cpp (SPEC-0046, ADR-0022): motor de STT local, subprocesso
// injetado só no main process — `stt-engine.ts` nunca importa `electron` nem
// conhece caminho real algum (portas injetadas aqui, mesmo molde do Piper).

/** Sobe o binário `whisper-cli` sempre por argv array (nunca `shell: true`). */
function nodeSpawnStt(): SpawnStt {
  return (command, args) => {
    const child = nodeSpawn(command, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdoutListeners: Array<(chunk: string) => void> = [];
    const stderrListeners: Array<(chunk: string) => void> = [];
    const exitListeners: Array<(code: number | null) => void> = [];

    child.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString('utf8');
      for (const cb of stdoutListeners) cb(chunk);
    });
    child.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString('utf8');
      for (const cb of stderrListeners) cb(chunk);
    });
    child.on('exit', (code) => {
      for (const cb of exitListeners) cb(code);
    });

    const process: SttProcess = {
      onStdout: (cb) => stdoutListeners.push(cb),
      onStderr: (cb) => stderrListeners.push(cb),
      onExit: (cb) => exitListeners.push(cb),
      kill: (signal) => {
        child.kill(signal);
      },
    };
    return process;
  };
}

/** Verificação síncrona de presença de arquivo — fail-safe, nunca lança (D10 de `isAvailable()`). */
function nodeSttStat(): (path: string) => boolean {
  return (path) => {
    try {
      accessSync(path);
      return true;
    } catch {
      return false;
    }
  };
}

/**
 * Resolução dos recursos em três níveis, espelho de `resolvePiperDir()`:
 * `ATLAS_STT_DIR` → `process.resourcesPath/stt` quando empacotado →
 * `resources/stt` em desenvolvimento. Nenhum download, em runtime ou não.
 */
function resolveSttDir(): string {
  const envDir = process.env['ATLAS_STT_DIR'];
  if (envDir !== undefined && envDir.trim() !== '') {
    return envDir;
  }
  if (app.isPackaged) {
    return join(process.resourcesPath, 'stt');
  }
  return join(__dirname, '..', 'resources', 'stt');
}

const sttEngine = createSttEngine({
  spawn: nodeSpawnStt(),
  resolveDir: resolveSttDir,
  tmpDirProvider: () => tmpdir(),
  randomId: () => randomUUID(),
  now: () => Date.now(),
  writeFile: (path, data) => writeFile(path, data),
  stat: nodeSttStat(),
  unlink: (path) => rm(path, { force: true }),
});

/** Verificação síncrona de presença de arquivo — fail-safe, nunca lança (mesmo molde do STT). */
function nodeVadStat(): (path: string) => boolean {
  return (path) => {
    try {
      accessSync(path);
      return true;
    } catch {
      return false;
    }
  };
}

/** Lê um arquivo binário como `ArrayBuffer` — cópia própria, nunca o buffer pooled do Node. */
async function readFileAsArrayBuffer(path: string): Promise<ArrayBuffer> {
  const buffer = await readFile(path);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

// VAD (Silero, SPEC-0052/ADR-0023): diretório canônico ÚNICO, irmão do
// documento do renderer — sem override por env (D6), diferente dos 3 níveis
// do Piper/whisper porque o consumidor real do `<script>` é o documento, não
// um binário invocado pelo main.
const vadResources = createVadResources({
  resolveDir: () => join(__dirname, 'renderer', 'vendor', 'vad'),
  readFile: readFileAsArrayBuffer,
  stat: nodeVadStat(),
});

// Janela de captura (SPEC-0046, D9/D17): único estado de `captureInFlight`
// consumido pelos dois handlers de permissão de mídia abaixo — aberta/
// rearmada por `'atlas:stt:capture:begin'`, fechada por
// `'atlas:stt:capture:end'`, pelo watchdog de 35s, ou pelos gatilhos de
// ciclo de vida fiados em `createWindow()`/`before-quit` mais abaixo.
const captureWindow = createCaptureWindow({
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as NodeJS.Timeout),
});

interface MediaPermissionDetails {
  readonly mediaTypes?: readonly string[];
}

function buildMediaPermissionRequest(
  permission: string,
  details: MediaPermissionDetails | undefined,
): Parameters<typeof decideMediaPermission>[0] {
  const requestedMedia = details?.mediaTypes;
  return requestedMedia === undefined
    ? { permission, captureInFlight: captureWindow.isOpen() }
    : { permission, requestedMedia, captureInFlight: captureWindow.isOpen() };
}

/**
 * Registra a política de permissão de mídia na `session` padrão do Electron.
 *
 * `session.defaultSession` só pode ser acessado depois de `app.whenReady()`
 * (o Electron lança `TypeError: Session can only be received when app is
 * ready` se tocado no topo do módulo, em nível de importação) — por isso
 * esta função é chamada de dentro do callback de `app.whenReady()`, nunca no
 * momento em que este arquivo é avaliado. Ver SPEC-0046, correção pós-fecho.
 */
function registerMediaPermissionHandlers(): void {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      const granted = decideMediaPermission(
        buildMediaPermissionRequest(permission, details as MediaPermissionDetails),
      );
      callback(granted);
    },
  );

  session.defaultSession.setPermissionCheckHandler((_webContents, permission, _origin, details) => {
    return decideMediaPermission(
      buildMediaPermissionRequest(permission, details as MediaPermissionDetails | undefined),
    );
  });
}

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

  // Gatilhos de fechamento da janela de captura (D17): navegação/recarga do
  // `webContents` e o fechamento da própria janela — nenhum deles deve
  // deixar a permissão de microfone concedida além do necessário.
  window.webContents.on('did-start-navigation', () => captureWindow.end());
  window.webContents.on('did-finish-load', () => captureWindow.end());
  window.on('closed', () => captureWindow.end());

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

// STT (entrada por voz, SPEC-0046, D12/D17): cinco canais IPC pinados.
ipcMain.handle('atlas:stt:available', () => {
  const available = sttEngine.isAvailable();
  if (!available) {
    return { available: false, reason: 'engine-unavailable' };
  }
  return { available: true, engine: sttEngine.describe() };
});
ipcMain.handle('atlas:stt:transcribe', (_event, payload: SttTranscribeInput) =>
  sttEngine.transcribe(payload),
);
ipcMain.handle('atlas:stt:cancel', () => {
  sttEngine.cancel();
});
ipcMain.handle('atlas:stt:capture:begin', () => {
  captureWindow.begin();
});
ipcMain.handle('atlas:stt:capture:end', () => {
  captureWindow.end();
});

// VAD (SPEC-0052): dois canais IPC pinados. Nenhum download — presença de
// arquivo checada a cada chamada (mesma limitação conhecida de
// `PiperTts.isAvailable()`/`SttEngine.isAvailable()`: prova presença, não
// execução).
ipcMain.handle('atlas:vad:available', () => {
  if (!vadResources.isAvailable()) {
    return { available: false, reason: 'resources-missing' };
  }
  return { available: true };
});
ipcMain.handle('atlas:vad:resources', () => vadResources.load());

// Gesto de escape (SPEC-0051): canal síncrono na semântica de `handle`
// (nunca sobe/desliga um Core) — só marca como abandonada toda operação
// cancelável (`ask`/turno de chat) ainda ativa.
ipcMain.handle('atlas:cancel', () => cancelInFlightOperation());

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
  registerMediaPermissionHandlers();
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
  // D17: a app encerrando é um dos gatilhos de fechamento pinados da janela
  // de captura — nunca deixa a permissão de microfone concedida.
  captureWindow.end();
});
