import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCaptureWindow, decideMediaPermission } from '../src/media-permission.js';

describe('media-permission: nunca importa electron', () => {
  it('src/media-permission.ts não referencia electron', () => {
    const source = readFileSync(join(__dirname, '..', 'src', 'media-permission.ts'), 'utf8');
    expect(source).not.toContain("from 'electron'");
    expect(source).not.toContain("require('electron')");
  });
});

describe('media-permission: decideMediaPermission (CA18)', () => {
  it('permission ≠ "media" ⇒ false', () => {
    expect(
      decideMediaPermission({
        permission: 'geolocation',
        requestedMedia: ['audio'],
        captureInFlight: true,
      }),
    ).toBe(false);
  });

  it('"media" com vídeo pedido ⇒ false, mesmo com janela aberta', () => {
    expect(
      decideMediaPermission({
        permission: 'media',
        requestedMedia: ['audio', 'video'],
        captureInFlight: true,
      }),
    ).toBe(false);
    expect(
      decideMediaPermission({
        permission: 'media',
        requestedMedia: ['video'],
        captureInFlight: true,
      }),
    ).toBe(false);
  });

  it('"media" com áudio SEM janela aberta ⇒ false', () => {
    expect(
      decideMediaPermission({
        permission: 'media',
        requestedMedia: ['audio'],
        captureInFlight: false,
      }),
    ).toBe(false);
  });

  it('"media" com áudio COM janela aberta ⇒ true', () => {
    expect(
      decideMediaPermission({
        permission: 'media',
        requestedMedia: ['audio'],
        captureInFlight: true,
      }),
    ).toBe(true);
  });

  it('entrada malformada/undefined ⇒ false, sem lançar', () => {
    expect(decideMediaPermission(undefined)).toBe(false);
    expect(decideMediaPermission(null)).toBe(false);
    // @ts-expect-error -- entrada deliberadamente malformada
    expect(() => decideMediaPermission('media')).not.toThrow();
    // @ts-expect-error -- entrada deliberadamente malformada
    expect(decideMediaPermission('media')).toBe(false);
    // @ts-expect-error -- sem requestedMedia nem captureInFlight
    expect(decideMediaPermission({ permission: 'media' })).toBe(false);
  });
});

describe('media-permission: createCaptureWindow — ciclo de vida (CA19)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    return createCaptureWindow({
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle as NodeJS.Timeout),
    });
  }

  it('begin() abre e arma o watchdog', () => {
    const win = setup();
    expect(win.isOpen()).toBe(false);
    win.begin();
    expect(win.isOpen()).toBe(true);
  });

  it('begin() repetido é idempotente e REARMA o watchdog (primitiva de que R1 depende)', () => {
    const win = setup();
    win.begin();
    vi.advanceTimersByTime(30_000);
    expect(win.isOpen()).toBe(true); // ainda dentro dos 35s originais

    // Rearma aos 30s — o watchdog volta a contar do zero a partir daqui.
    win.begin();
    vi.advanceTimersByTime(30_000); // 30s desde o rearme (60s desde o begin original)
    expect(win.isOpen()).toBe(true); // se não tivesse rearmado, já teria fechado aos 35s originais

    vi.advanceTimersByTime(5_000); // completa os 35s desde o rearme
    expect(win.isOpen()).toBe(false);
  });

  it('end() fecha e desarma o watchdog', () => {
    const win = setup();
    win.begin();
    win.end();
    expect(win.isOpen()).toBe(false);
    // Watchdog desarmado: nada acontece ao avançar o relógio.
    vi.advanceTimersByTime(60_000);
    expect(win.isOpen()).toBe(false);
  });

  it('end() repetido não lança', () => {
    const win = setup();
    expect(() => {
      win.end();
      win.end();
    }).not.toThrow();
  });

  it('watchdog de 35s fecha sozinha sem end()', () => {
    const win = setup();
    win.begin();
    vi.advanceTimersByTime(34_999);
    expect(win.isOpen()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(win.isOpen()).toBe(false);
  });

  it('end() após o watchdog já ter fechado não lança nem reabre', () => {
    const win = setup();
    win.begin();
    vi.advanceTimersByTime(35_000);
    expect(win.isOpen()).toBe(false);
    expect(() => win.end()).not.toThrow();
    expect(win.isOpen()).toBe(false);
  });
});

describe('media-permission: asserção estática de src/main.ts (CA20, D16 — nunca mock de electron)', () => {
  const mainSource = readFileSync(join(__dirname, '..', 'src', 'main.ts'), 'utf8');

  it('registra os dois handlers de permissão de mídia', () => {
    expect(mainSource).toContain('setPermissionRequestHandler');
    expect(mainSource).toContain('setPermissionCheckHandler');
  });

  it('registra os cinco canais atlas:stt:*', () => {
    for (const channel of [
      'atlas:stt:available',
      'atlas:stt:transcribe',
      'atlas:stt:cancel',
      'atlas:stt:capture:begin',
      'atlas:stt:capture:end',
    ]) {
      expect(mainSource).toContain(`'${channel}'`);
    }
  });

  it('fia o fechamento da janela de captura nos três gatilhos pinados', () => {
    expect(mainSource).toContain('did-start-navigation');
    expect(mainSource).toContain('did-finish-load');
    expect(mainSource).toMatch(/window\.on\(\s*['"]closed['"]/);
    expect(mainSource).toMatch(/app\.on\(\s*['"]before-quit['"]/);
    expect(mainSource).toContain('captureWindow.end()');
  });

  // Regressão do defeito descoberto na primeira execução real da app: as duas
  // chamadas de `session.defaultSession.*` estavam escritas no topo do
  // módulo, portanto avaliadas na importação — mas `session.defaultSession`
  // só pode ser acessado depois de `app.whenReady()` (o Electron lança
  // `TypeError: Session can only be received when app is ready`). A
  // asserção original (acima) prova só que o texto existe em `main.ts`, não
  // *onde* ele é alcançado — passava verde com o bug em produção. Este bloco
  // prova o posicionamento: `session.defaultSession` só aparece dentro do
  // corpo de uma função (nunca em nível de módulo, onde uma referência
  // executaria na importação — declarações de função não executam o corpo
  // ao serem definidas), e essa função só é invocada de dentro do callback
  // de `app.whenReady().then(...)`, antes de `createWindow()`.
  //
  // Isto continua sendo prova estática de fonte, não um teste de arranque
  // (D16 segue em vigor: nenhum `vi.mock('electron')`). O que muda é o que a
  // asserção consegue honestamente demonstrar: não mais "o texto existe em
  // algum lugar do arquivo", mas "o texto só existe dentro de uma função, e
  // essa função só é chamada depois que o app está pronto".
  it('session.defaultSession só é referenciado dentro de uma função chamada por app.whenReady(), nunca em nível de módulo (regressão)', () => {
    const functionMatch = mainSource.match(
      /function registerMediaPermissionHandlers\(\): void \{([\s\S]*?)\n\}\n/,
    );
    expect(functionMatch).not.toBeNull();
    const functionBody = functionMatch![1]!;

    // A função de fato registra os dois handlers.
    const requestHandlerInBody = functionBody.match(/session\.defaultSession\./g) ?? [];
    expect(requestHandlerInBody.length).toBe(2);

    // Nenhuma outra ocorrência de `session.defaultSession` existe no
    // arquivo fora dessa função — ou seja, nenhuma referência sobrevive em
    // nível de módulo, onde seria avaliada na importação.
    const totalOccurrences = mainSource.match(/session\.defaultSession\./g) ?? [];
    expect(totalOccurrences.length).toBe(requestHandlerInBody.length);

    // A função só é invocada uma vez em todo o arquivo (além da própria
    // declaração), e essa chamada mora dentro do callback de
    // `app.whenReady().then(...)`, antes de `createWindow()`.
    const whenReadyMatch = mainSource.match(
      /app\.whenReady\(\)\.then\(\(\) => \{([\s\S]*?)\n\}\);\n/,
    );
    expect(whenReadyMatch).not.toBeNull();
    const whenReadyBody = whenReadyMatch![1]!;

    expect(whenReadyBody).toContain('registerMediaPermissionHandlers()');

    const registerCallIndex = whenReadyBody.indexOf('registerMediaPermissionHandlers()');
    const createWindowCallIndex = whenReadyBody.indexOf('createWindow()');
    expect(createWindowCallIndex).toBeGreaterThan(-1);
    expect(registerCallIndex).toBeLessThan(createWindowCallIndex);

    // A chamada de `registerMediaPermissionHandlers()` só existe dentro do
    // callback de `whenReady` — nenhuma segunda chamada solta em nível de
    // módulo (o que reintroduziria o defeito por outra via). A regex também
    // casa a própria assinatura da declaração (`function
    // registerMediaPermissionHandlers(): void {`), por isso o teto
    // esperado é 2: a declaração + a única chamada.
    const totalCalls = mainSource.match(/registerMediaPermissionHandlers\(\)/g) ?? [];
    expect(totalCalls.length).toBe(2);
  });
});
