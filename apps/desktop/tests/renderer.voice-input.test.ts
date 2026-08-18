import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  RendererFixture,
  RendererFixtureOptions,
  RendererSttResult,
} from './helpers/renderer-harness.js';
import { loadRenderer } from './helpers/renderer-harness.js';

// SPEC-0046: entrada por voz (STT) — captura por push-to-talk no renderer,
// transcrição sempre no main (dublada aqui via `window.atlas.stt`), texto
// nunca enviado automaticamente. Cobertura sem hardware de áudio, sobre o
// harness jsdom da SPEC-0045 (relógio injetável + dublês de mídia da D19).

interface HtmlButtonLike {
  disabled: boolean;
  textContent: string;
  title: string;
  hidden: boolean;
  click(): void;
}

interface HtmlInputLike {
  value: string;
}

let fixture: RendererFixture | undefined;

afterEach(() => {
  fixture?.close();
  fixture = undefined;
});

function micButtonEl(f: RendererFixture): HtmlButtonLike {
  return f.document.getElementById('mic-button') as unknown as HtmlButtonLike;
}

function micCancelEl(f: RendererFixture): HtmlButtonLike {
  return f.document.getElementById('mic-cancel-button') as unknown as HtmlButtonLike;
}

function micStatusText(f: RendererFixture): string {
  return f.document.getElementById('mic-status')?.textContent ?? '';
}

function chatInputEl(f: RendererFixture): HtmlInputLike {
  return f.document.getElementById('chat-input') as unknown as HtmlInputLike;
}

function chatInputValue(f: RendererFixture): string {
  return chatInputEl(f).value;
}

function clickMic(f: RendererFixture): void {
  micButtonEl(f).click();
}

function clickCancel(f: RendererFixture): void {
  micCancelEl(f).click();
}

async function open(options: RendererFixtureOptions = {}): Promise<RendererFixture> {
  fixture = await loadRenderer(options);
  return fixture;
}

async function openAvailable(options: RendererFixtureOptions = {}): Promise<RendererFixture> {
  return open({ ...options, stt: { available: true, ...options.stt } });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('renderer STT: superfície e disponibilidade (CA21/CA32)', () => {
  it('CA21: index.html contém o botão de microfone e o de cancelamento', async () => {
    const f = await open();
    expect(f.document.getElementById('mic-button')).not.toBeNull();
    expect(f.document.getElementById('mic-cancel-button')).not.toBeNull();
  });

  it('CA32: atlas:stt:available respondendo { available: false } deixa o botão desabilitado com aviso do motivo', async () => {
    const f = await open({ stt: { available: false, reason: 'engine-unavailable' } });
    await f.flush();
    expect(micButtonEl(f).disabled).toBe(true);
    expect(micButtonEl(f).title).not.toBe('');
  });

  it('CA32: getUserMedia rejeitando ⇒ aviso textual, botão volta a ocioso, entrada intacta', async () => {
    const f = await openAvailable({ media: { getUserMediaBehavior: 'reject' } });
    chatInputEl(f).value = 'texto existente';
    clickMic(f);
    await f.flush();
    expect(micStatusText(f)).not.toBe('');
    expect(micButtonEl(f).disabled).toBe(false);
    expect(micButtonEl(f).textContent).toBe('Falar');
    expect(chatInputValue(f)).toBe('texto existente');
  });
});

describe('renderer STT: relógio injetável e EPILOGUE (CA22/CA23)', () => {
  it('CA22: fixture.clock.advance opera sobre os timers da janela jsdom — nunca por espera real', async () => {
    const f = await openAvailable();
    clickMic(f);
    await f.flush();
    expect(micButtonEl(f).textContent).toBe('Parar gravação');

    // Drenar micro/macrotarefas REAIS não faz o timer de 30s disparar — ele
    // mora nos timers da janela jsdom, substituídos pelo relógio injetado.
    await f.flush();
    expect(micButtonEl(f).textContent).toBe('Parar gravação');

    f.clock.advance(30_000);
    await f.flush();
    expect(micButtonEl(f).textContent).not.toBe('Parar gravação');
  });

  it('CA23: os símbolos novos do glue de voz estão declarados no EPILOGUE e acessíveis por internals', async () => {
    const f = await open();
    expect(f.internals['floatChunksToInt16']).toBeDefined();
    expect(f.internals['describeSttFailure']).toBeDefined();
  });
});

describe('renderer STT: ciclo feliz e rearme (CA24/CA25)', () => {
  it('CA24: captureBegin ANTES de getUserMedia; getUserMedia chamado 1x com {audio:true}, sem video', async () => {
    const f = await openAvailable();
    clickMic(f);
    // Sincronamente após o clique: `captureBegin` já foi despachado
    // (incrementado antes do primeiro `await`), `getUserMedia` ainda não.
    expect(f.calls.sttCaptureBeginCalls).toBe(1);
    expect(f.calls.getUserMediaCalls).toEqual([]);
    await f.flush();
    expect(f.calls.getUserMediaCalls).toEqual([{ audio: true }]);
  });

  it('CA25: captureBegin é chamado de novo quando getUserMedia resolve — sobrevive ao orçamento do watchdog', async () => {
    const f = await openAvailable({ media: { getUserMediaDelayMs: 40_000 } });
    clickMic(f);
    await f.flush();
    // getUserMedia ainda não resolveu (atrasado 40s) ⇒ só o 1º begin ocorreu.
    expect(f.calls.sttCaptureBeginCalls).toBe(1);

    f.clock.advance(40_000);
    await f.flush();
    expect(f.calls.sttCaptureBeginCalls).toBe(2);
    expect(f.calls.getUserMediaCalls).toEqual([{ audio: true }]);
  });

  it('CA25: se getUserMedia rejeita, o segundo begin NÃO acontece', async () => {
    const f = await openAvailable({ media: { getUserMediaBehavior: 'reject' } });
    clickMic(f);
    await f.flush();
    expect(f.calls.sttCaptureBeginCalls).toBe(1);
    expect(f.calls.sttCaptureEndCalls).toBe(1);
  });
});

describe('renderer STT: liberação de recursos em cada caminho de saída (CA26/CA27)', () => {
  it('cancelamento durante a gravação: stop() nas tracks, close() do AudioContext, capture:end — sem transcribe', async () => {
    const f = await openAvailable();
    clickMic(f);
    await f.flush();
    clickCancel(f);
    await f.flush();
    expect(f.calls.mediaTrackStops).toBe(1);
    expect(f.calls.audioContextClosed).toBe(1);
    expect(f.calls.sttCaptureEndCalls).toBe(1);
    expect(f.calls.sttTranscribeCalls).toEqual([]); // CA27
  });

  it('rejeição de getUserMedia: nenhum stream/AudioContext a liberar, só capture:end', async () => {
    const f = await openAvailable({ media: { getUserMediaBehavior: 'reject' } });
    clickMic(f);
    await f.flush();
    expect(f.calls.mediaTrackStops).toBe(0);
    expect(f.calls.audioContextClosed).toBe(0);
    expect(f.calls.sttCaptureEndCalls).toBe(1);
  });

  it('teto de 30s (CA29): encerra sozinho, avisa, e SEGUE para a transcrição', async () => {
    const pending = deferred<RendererSttResult>();
    const f = await openAvailable({ stt: { available: true, transcribe: () => pending.promise } });
    clickMic(f);
    await f.flush();

    f.clock.advance(30_000);
    await f.flush();

    expect(f.calls.mediaTrackStops).toBe(1);
    expect(f.calls.audioContextClosed).toBe(1);
    expect(f.calls.sttCaptureEndCalls).toBe(1);
    expect(micStatusText(f)).toContain('Tempo máximo');
    expect(micButtonEl(f).textContent).toBe('Transcrevendo…');
    expect(f.calls.sttTranscribeCalls).toHaveLength(1);

    pending.resolve({ ok: true, text: 'ditado por voz', durationMs: 30_000 });
    await f.flush();
    expect(chatInputValue(f)).toContain('ditado por voz');
    expect(micStatusText(f)).toBe('');
  });

  it('falha da transcrição: recursos já liberados antes do desfecho chegar', async () => {
    const f = await openAvailable({
      stt: {
        available: true,
        transcribe: () => Promise.resolve({ ok: false, reason: 'engine-failed' }),
      },
    });
    clickMic(f);
    await f.flush();
    clickMic(f); // encerra por clique — segue para a transcrição
    await f.flush();
    expect(f.calls.mediaTrackStops).toBe(1);
    expect(f.calls.audioContextClosed).toBe(1);
    expect(f.calls.sttCaptureEndCalls).toBe(1);
    expect(micStatusText(f)).toMatch(/falhou/i);
  });

  it('sucesso (CA30): texto no <input>, NÃO envia automaticamente', async () => {
    const f = await openAvailable({
      stt: {
        available: true,
        transcribe: () => Promise.resolve({ ok: true, text: 'olá mundo', durationMs: 800 }),
      },
    });
    clickMic(f);
    await f.flush();
    clickMic(f);
    await f.flush();
    expect(f.calls.mediaTrackStops).toBe(1);
    expect(f.calls.audioContextClosed).toBe(1);
    expect(f.calls.sttCaptureEndCalls).toBe(1);
    expect(chatInputValue(f)).toBe('olá mundo');
    expect(f.calls.chatSend).toEqual([]);
  });
});

describe('renderer STT: cancelar durante a transcrição — R3 (CA28)', () => {
  it('"Cancelar" fica visível e habilitado; emite atlas:stt:cancel; UI volta a ocioso; entrada intacta', async () => {
    const pending = deferred<RendererSttResult>();
    const f = await openAvailable({ stt: { available: true, transcribe: () => pending.promise } });
    chatInputEl(f).value = 'preservado';
    clickMic(f);
    await f.flush();
    clickMic(f); // encerra a gravação, entra em 'transcribing'
    await f.flush();

    expect(micButtonEl(f).textContent).toBe('Transcrevendo…');
    expect(micCancelEl(f).hidden).toBe(false);
    expect(micCancelEl(f).disabled).toBe(false);

    clickCancel(f);
    await f.flush();
    expect(f.calls.sttCancelCalls).toBe(1);

    // O desfecho 'cancelled' chega pela MESMA promessa de transcribe() em
    // voo — o main resolve; aqui simulamos essa resolução.
    pending.resolve({ ok: false, reason: 'cancelled' });
    await f.flush();

    expect(micButtonEl(f).textContent).toBe('Falar');
    expect(chatInputValue(f)).toBe('preservado');
    expect(micStatusText(f)).not.toBe('');
  });
});

describe('renderer STT: anexação ao campo de entrada (CA31)', () => {
  it('campo já com texto: a transcrição é ANEXADA ao final, nunca sobrescreve', async () => {
    const f = await openAvailable({
      stt: {
        available: true,
        transcribe: () => Promise.resolve({ ok: true, text: 'mundo', durationMs: 500 }),
      },
    });
    chatInputEl(f).value = 'olá';
    clickMic(f);
    await f.flush();
    clickMic(f);
    await f.flush();
    expect(chatInputValue(f)).toBe('olá mundo');
  });
});

describe('renderer STT: aviso por reason (CA33)', () => {
  it('cada um dos nove reasons de falha produz um aviso visível e distinguível', async () => {
    const f = await open();
    const reasons = [
      'invalid-audio',
      'audio-too-long',
      'io-failed',
      'empty-transcript',
      'engine-failed',
      'engine-unavailable',
      'timeout',
      'cancelled',
      'busy',
    ];
    const describeSttFailure = f.internals['describeSttFailure'] as (reason: string) => string;
    const messages = new Set<string>();
    for (const reason of reasons) {
      const message = describeSttFailure(reason);
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
      messages.add(message);
    }
    expect(messages.size).toBe(reasons.length);
  });
});

describe('renderer STT: serialização de gestos nos dois sentidos (CA34)', () => {
  it('direção 1: gravando ⇒ botão de envio e seletor de Persona desabilitados', async () => {
    const f = await openAvailable();
    clickMic(f);
    await f.flush();
    const sendButton = f.document.getElementById('chat-send') as unknown as { disabled: boolean };
    const personaSelectEl = f.document.getElementById('persona-select') as unknown as {
      disabled: boolean;
    };
    expect(sendButton.disabled).toBe(true);
    expect(personaSelectEl.disabled).toBe(true);
  });

  it('direção 2: turno de chat em voo ⇒ botão de microfone desabilitado, reabilitado ao fim', async () => {
    const pending = deferred<{ reply: string; steps: []; learned: [] }>();
    const f = await openAvailable({ chatSend: () => pending.promise });
    await f.flush();

    chatInputEl(f).value = 'oi';
    f.document
      .getElementById('chat-form')
      ?.dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true }));
    await f.flush();

    expect(micButtonEl(f).disabled).toBe(true);

    pending.resolve({ reply: 'oi', steps: [], learned: [] });
    await f.flush();
    expect(micButtonEl(f).disabled).toBe(false);
  });
});

describe('renderer STT: forma exata do payload IPC (CA35)', () => {
  it('só ArrayBuffer de PCM + sampleRate cruzam o IPC — nenhum campo de duração', async () => {
    const f = await openAvailable();
    clickMic(f);
    await f.flush();
    clickMic(f);
    await f.flush();

    expect(f.calls.sttTranscribeCalls).toHaveLength(1);
    const call = f.calls.sttTranscribeCalls[0]!;
    expect(Object.keys(call).sort()).toEqual(['pcm', 'sampleRate']);
    // `pcm` vem do realm da janela jsdom — compara pelo construtor daquele
    // realm, não pelo `ArrayBuffer` global do processo de teste (realms
    // distintos: `instanceof` cross-realm sempre falharia).
    expect(call.pcm).toBeInstanceOf(f.window.ArrayBuffer);
    expect(call.sampleRate).toBe(16000);
  });
});

describe('renderer STT: gate mecânico de ausência de rede (CA15)', () => {
  it('src/renderer/renderer.js não referencia fetch/XMLHttpRequest/WebSocket/EventSource/http/https/net', () => {
    const rendererJsPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'src',
      'renderer',
      'renderer.js',
    );
    const source = readFileSync(rendererJsPath, 'utf8');
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toMatch(/\bXMLHttpRequest\b/);
    expect(source).not.toMatch(/\bWebSocket\b/);
    expect(source).not.toMatch(/\bEventSource\b/);
    expect(source).not.toMatch(/\bhttp:\/\//);
    expect(source).not.toMatch(/\bhttps:\/\//);
  });
});
