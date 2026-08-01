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
});
