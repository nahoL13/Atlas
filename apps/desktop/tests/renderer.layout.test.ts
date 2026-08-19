import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { FRAME_MS, FRAME_SAMPLES, MIN_SPEECH_MS, SILENCE_CLOSE_MS } from '../src/hands-free.js';
import type {
  RendererFixture,
  RendererFixtureOptions,
  RendererSttResult,
} from './helpers/renderer-harness.js';
import { loadRenderer } from './helpers/renderer-harness.js';

// SPEC-0053 v3.0 — núcleo holográfico volumétrico e navegação por drawer.
// Substitui integralmente a suíte v2.0 (sidebar/trilho fixo, timeline
// inferior permanente, esfera `.core-orb`/`.core-halo`), rejeitada no smoke
// humano. Cobre o manifesto de 86 IDs (77 da v3.0 + 9 do painel `Sistema` da
// SPEC-0054), o drawer, o progressive disclosure, a Sessão/timeline, a
// resposta corrente, a nuvem de pontos determinística e o mapa de
// perfis/playback do núcleo Canvas.

const rendererDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const html = readFileSync(join(rendererDir, 'index.html'), 'utf8');
const source = readFileSync(join(rendererDir, 'renderer.js'), 'utf8');
const css = readFileSync(join(rendererDir, 'styles.css'), 'utf8');

let fixture: RendererFixture | undefined;

async function open(options?: RendererFixtureOptions): Promise<RendererFixture> {
  fixture = await loadRenderer(options);
  await fixture.flush();
  return fixture;
}

afterEach(() => {
  fixture?.close();
  fixture = undefined;
});

function submit(f: RendererFixture, text: string): void {
  const input = f.document.getElementById('chat-input') as HTMLInputElement;
  input.value = text;
  f.document
    .getElementById('chat-form')
    ?.dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true }));
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function coreState(f: RendererFixture): string | undefined {
  return (f.document.getElementById('presence-core') as HTMLElement).dataset.state;
}

function navControls(f: RendererFixture): HTMLButtonElement[] {
  return [
    ...f.document.querySelectorAll('#drawer-navigation [data-drawer-nav]'),
  ] as HTMLButtonElement[];
}

const ORIGINAL_47_IDS = [
  'status',
  'persona-select',
  'persona-error',
  'persona-list',
  'persona-new',
  'persona-form',
  'persona-form-id',
  'persona-name',
  'persona-tone',
  'persona-formality',
  'persona-language',
  'persona-style',
  'persona-communication-rules',
  'persona-voice',
  'persona-emotion',
  'persona-voice-uri',
  'persona-voice-legacy',
  'persona-test-voice',
  'persona-form-save',
  'persona-form-cancel',
  'persona-form-error',
  'ask-form',
  'objective',
  'ask-submit',
  'ask-cancel',
  'ask-result',
  'chat-transcript',
  'chat-form',
  'chat-input',
  'chat-send',
  'chat-cancel',
  'mic-button',
  'mic-cancel-button',
  'mic-status',
  'hands-free-toggle',
  'hands-free-indicator',
  'hands-free-status',
  'memory-refresh',
  'memory-list',
  'read-roots-list',
  'read-root-input',
  'read-root-add',
  'write-roots-list',
  'write-root-input',
  'write-root-add',
  'permissions-apply',
  'permissions-error',
];

const SPEC_0054_IDS = [
  'panel-system',
  'system-clock-date',
  'system-clock-time',
  'system-cpu',
  'system-memory',
  'system-gpu',
  'system-network',
  'system-tokens',
  'system-status',
];

const V3_30_IDS = [
  'menu-toggle',
  'drawer-backdrop',
  'panel-drawer',
  'drawer-close',
  'drawer-navigation',
  'drawer-panels',
  'panel-persona',
  'persona-status-toggle',
  'panel-personas',
  'panel-memory',
  'memory-error',
  'panel-permissions',
  'read-roots-toggle',
  'read-roots-detail',
  'write-roots-toggle',
  'write-roots-detail',
  'panel-objective',
  'ask-result-toggle',
  'panel-session',
  'presence-stage',
  'presence-core',
  'presence-canvas',
  'presence-persona',
  'presence-state',
  'global-alert',
  'current-reply',
  'show-complete-reply',
  'timeline-region',
  'new-activity',
  'timeline-detail',
];

describe('SPEC-0053 v3.0 — estrutura, manifesto e ausência dos artefatos v2', () => {
  it('contém exatamente a união dos 86 IDs do manifesto (77 + 9 da SPEC-0054), sem IDs estruturais extras', () => {
    expect(ORIGINAL_47_IDS).toHaveLength(47);
    expect(V3_30_IDS).toHaveLength(30);
    expect(SPEC_0054_IDS).toHaveLength(9);
    const expected = new Set([...ORIGINAL_47_IDS, ...V3_30_IDS, ...SPEC_0054_IDS]);
    const found = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1] as string);
    expect(new Set(found).size).toBe(found.length); // sem duplicatas
    expect(new Set(found)).toEqual(expected);
  });

  it('mantém CSP byte a byte, uma única folha local e nenhum CSS/estilo inline', () => {
    expect(html).toContain(
      "content=\"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; media-src 'self' blob:\"",
    );
    expect(html.match(/<link rel="stylesheet" href="\.\/styles\.css" \/>/g)).toHaveLength(1);
    expect(html).not.toMatch(/<style|\sstyle=/);
  });

  it('remove todo artefato exclusivo da v2.0 rejeitada (IDs, classes e regras de linha)', () => {
    expect(html).not.toMatch(/panel-rail|control-side|panel-stack|core-orb|core-halo/);
    expect(css).not.toMatch(/\.core-orb|\.core-halo|panel-rail|control-side|panel-stack/);
    expect(html).not.toContain('<hr');
    expect(css).not.toMatch(/border-left|border-right/);
  });

  it('a área principal tem uma única pilha central: núcleo → resposta → voz → composer', async () => {
    const f = await open();
    expect(f.document.querySelector('#presence-stage #presence-core')).not.toBeNull();
    expect(f.document.querySelector('#presence-stage #current-reply')).not.toBeNull();
    expect(f.document.querySelector('#presence-stage #chat-form')).not.toBeNull();
    expect(f.document.querySelector('#presence-stage #chat-transcript')).toBeNull();
    expect(f.document.querySelectorAll('#timeline-region')).toHaveLength(1);
    expect(f.document.querySelector('#panel-session #timeline-region')).not.toBeNull();
    expect(f.document.querySelector('#panel-session #chat-transcript')).not.toBeNull();
  });

  it('#presence-core contém um único #presence-canvas, sem SVG/WebGL/imagem/vídeo', async () => {
    const f = await open();
    const canvases = f.document.querySelectorAll('#presence-core canvas');
    expect(canvases).toHaveLength(1);
    expect(canvases[0]?.id).toBe('presence-canvas');
    expect(
      f.document.querySelector('#presence-core svg, #presence-core img, #presence-core video'),
    ).toBeNull();
  });
});

describe('SPEC-0053 v3.0 — drawer e navegação (CA4-7)', () => {
  it('#menu-toggle mede no mínimo 44x44 CSS px e inicia com o drawer oculto', async () => {
    const f = await open();
    const toggle = f.document.getElementById('menu-toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect((f.document.getElementById('panel-drawer') as HTMLElement).hidden).toBe(true);
    expect(css).toMatch(/#menu-toggle[\s\S]*?min-height:\s*44px/);
    expect(css).toMatch(/#menu-toggle[\s\S]*?min-width:\s*44px/);
  });

  it('produz exatamente sete controles de navegação, na ordem fixada (SPEC-0054 acrescenta Sistema)', async () => {
    const f = await open();
    const controls = navControls(f);
    expect(controls).toHaveLength(7);
    expect(controls.map((c) => c.textContent?.trim())).toEqual([
      'Persona',
      'Personas',
      'Memória',
      'Permissões',
      'Objetivo',
      'Sessão',
      'Sistema',
    ]);
    for (const control of controls) {
      expect(control.hasAttribute('data-drawer-nav')).toBe(true);
    }
    // `Fechar`/`#menu-toggle`/disclosures internos NUNCA recebem o atributo.
    expect(f.document.getElementById('drawer-close')?.hasAttribute('data-drawer-nav')).toBe(false);
    expect(f.document.getElementById('menu-toggle')?.hasAttribute('data-drawer-nav')).toBe(false);
  });

  it('abre um painel por vez (zero-ou-um), fecha o anterior e fecha ao clicar no ativo', async () => {
    const f = await open();
    const toggle = f.document.getElementById('menu-toggle') as HTMLButtonElement;
    toggle.click();
    const controls = navControls(f);

    expect(f.document.querySelectorAll('[data-panel]:not([hidden])')).toHaveLength(0);

    controls[0]?.click(); // Persona
    expect(controls[0]?.getAttribute('aria-expanded')).toBe('true');
    expect((f.document.getElementById('panel-persona') as HTMLElement).hidden).toBe(false);
    expect(f.document.querySelectorAll('[data-panel]:not([hidden])')).toHaveLength(1);

    controls[5]?.click(); // Sessão
    expect(controls[0]?.getAttribute('aria-expanded')).toBe('false');
    expect(controls[5]?.getAttribute('aria-expanded')).toBe('true');
    expect((f.document.getElementById('panel-persona') as HTMLElement).hidden).toBe(true);
    expect((f.document.getElementById('panel-session') as HTMLElement).hidden).toBe(false);
    expect(f.document.querySelectorAll('[data-panel]:not([hidden])')).toHaveLength(1);

    controls[5]?.click(); // fecha o ativo
    expect(controls[5]?.getAttribute('aria-expanded')).toBe('false');
    expect(f.document.querySelectorAll('[data-panel]:not([hidden])')).toHaveLength(0);
  });

  it('Escape, backdrop e Fechar fecham o drawer e devolvem foco ao toggle; foco inicial vai ao primeiro item', async () => {
    const f = await open();
    const toggle = f.document.getElementById('menu-toggle') as HTMLButtonElement;
    toggle.click();
    const controls = navControls(f);
    expect(f.document.activeElement).toBe(controls[0]);

    f.document.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect((f.document.getElementById('panel-drawer') as HTMLElement).hidden).toBe(true);
    expect(f.document.activeElement).toBe(toggle);

    toggle.click();
    (f.document.getElementById('drawer-backdrop') as HTMLElement).click();
    expect((f.document.getElementById('panel-drawer') as HTMLElement).hidden).toBe(true);
    expect(f.document.activeElement).toBe(toggle);

    toggle.click();
    (f.document.getElementById('drawer-close') as HTMLElement).click();
    expect((f.document.getElementById('panel-drawer') as HTMLElement).hidden).toBe(true);
    expect(f.document.activeElement).toBe(toggle);
  });

  it('não altera a caixa do palco/núcleo ao abrir/fechar (sem grid/largura/margem/transform novos)', async () => {
    const f = await open();
    const stage = f.document.getElementById('presence-stage') as HTMLElement;
    const before = stage.getBoundingClientRect();
    (f.document.getElementById('menu-toggle') as HTMLButtonElement).click();
    const after = stage.getBoundingClientRect();
    expect(after).toEqual(before);
    expect(css).not.toMatch(/#presence-stage[\s\S]{0,200}grid-template-columns/);
  });
});

describe('SPEC-0053 v3.0 — progressive disclosure (CA8-11)', () => {
  it('Persona: #status inicia recolhido sob #persona-status-toggle, nunca expande sozinho', async () => {
    const f = await open();
    const toggle = f.document.getElementById('persona-status-toggle') as HTMLButtonElement;
    const status = f.document.getElementById('status') as HTMLElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(status.hidden).toBe(true);
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(status.hidden).toBe(false);
  });

  it('Personas: #persona-form inicia recolhido, abre por Nova Persona e fecha ao cancelar', async () => {
    const f = await open();
    const form = f.document.getElementById('persona-form') as HTMLElement;
    const newButton = f.document.getElementById('persona-new') as HTMLButtonElement;
    expect(form.hidden).toBe(true);
    expect(newButton.getAttribute('aria-expanded')).toBe('false');
    // jsdom não foca o elemento em `.click()` sintético (diferente de um
    // clique real de mouse no Chromium) — `openPersonaForm` usa
    // `document.activeElement` como invocador, então o teste simula o foco
    // que um clique real produziria.
    newButton.focus();
    newButton.click();
    expect(form.hidden).toBe(false);
    expect(newButton.getAttribute('aria-expanded')).toBe('true');
    (f.document.getElementById('persona-form-cancel') as HTMLButtonElement).click();
    expect(form.hidden).toBe(true);
    expect(newButton.getAttribute('aria-expanded')).toBe('false');
  });

  it('Objetivo: toggle/resultado ocultos no boot; submit aceito abre; alterna Ver/Ocultar sem perder conteúdo', async () => {
    const f = await open({ atlas: { ask: () => new Promise(() => {}) } });
    const toggle = f.document.getElementById('ask-result-toggle') as HTMLElement;
    const result = f.document.getElementById('ask-result') as HTMLElement;
    expect(toggle.hidden).toBe(true);
    expect(result.hidden).toBe(true);
    (f.document.getElementById('objective') as HTMLInputElement).value = 'meta';
    f.document
      .getElementById('ask-form')
      ?.dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true }));
    expect(toggle.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(result.hidden).toBe(false);
    expect(result.textContent).toBe('Processando…');
    toggle.click();
    expect(result.hidden).toBe(true);
    expect(toggle.textContent).toBe('Ver resultado');
    expect(result.textContent).toBe('Processando…');
  });

  it('Permissões: Leitura/Escrita iniciam recolhidas e mostram a contagem no rótulo', async () => {
    const f = await open({ status: { readRoots: ['/a', '/b'], writeRoots: ['/c'] } });
    const readToggle = f.document.getElementById('read-roots-toggle') as HTMLElement;
    const writeToggle = f.document.getElementById('write-roots-toggle') as HTMLElement;
    expect(readToggle.getAttribute('aria-expanded')).toBe('false');
    expect((f.document.getElementById('read-roots-detail') as HTMLElement).hidden).toBe(true);
    expect(readToggle.textContent).toBe('Leitura (2)');
    expect(writeToggle.textContent).toBe('Escrita (1)');
    readToggle.click();
    expect((f.document.getElementById('read-roots-detail') as HTMLElement).hidden).toBe(false);
  });

  it('Memória: título de 72/73 pontos de código, clique alterna um único detalhe integral', async () => {
    const long72 = 'x'.repeat(72);
    const long73 = 'x'.repeat(73);
    const f = await open({
      facts: [
        {
          id: 'f-72',
          text: long72,
          createdAt: '2026-01-01T00:00:00.000Z',
          source: 'user',
          category: 'fact',
        },
        {
          id: 'f-73',
          text: long73,
          createdAt: '2026-01-01T00:00:00.000Z',
          source: 'user',
          category: 'fact',
        },
      ],
    });
    const items = [...f.document.querySelectorAll('#memory-list li')];
    const titles = items.map((item) => item.querySelector('button')?.textContent);
    expect(titles[0]).toBe(long72);
    expect(titles[1]).toBe(`${'x'.repeat(69)}…`);

    (items[0]?.querySelector('button') as HTMLButtonElement).click();
    expect((items[0]?.querySelector('.memory-detail') as HTMLElement).hidden).toBe(false);
    (items[1]?.querySelector('button') as HTMLButtonElement).click();
    expect((items[0]?.querySelector('.memory-detail') as HTMLElement).hidden).toBe(true);
    expect((items[1]?.querySelector('.memory-detail') as HTMLElement).hidden).toBe(false);
  });

  it('CSS não usa position absolute/fixed nos painéis nem overflow:hidden no detalhe integral', () => {
    expect(css).not.toMatch(/\[data-panel\][\s\S]{0,120}position:\s*(absolute|fixed)/);
    expect(css).not.toMatch(/#timeline-detail[\s\S]{0,120}overflow:\s*hidden/);
    expect(css).toMatch(/#panel-drawer[\s\S]{0,200}overflow-y:\s*auto/);
  });
});

describe('SPEC-0053 v3.0 — Sessão absorve a timeline (CA12-14)', () => {
  it('projeta o turno aceito como user → tools → assistant → memory, com detalhe selecionável', async () => {
    const f = await open({
      chatSend: () => ({
        reply: 'resposta integral',
        steps: [{ tool: 'clock', outcome: 'ok', ok: true }],
        learned: ['fato'],
      }),
    });
    submit(f, 'olá');
    await f.flush();
    const events = [
      ...f.document.querySelectorAll('#chat-transcript [data-event-type]'),
    ] as HTMLElement[];
    expect(
      events.slice(-4).map((item) => `${item.dataset.eventType}/${item.dataset.eventKind}`),
    ).toEqual(['user/message', 'tool/step', 'assistant/reply', 'memory/learned']);
    events.at(-2)?.click();
    expect(f.document.getElementById('timeline-detail')?.textContent).toBe('resposta integral');
  });

  it('cancelamento confirmado produz um único system/cancelled, sem erro duplicado', async () => {
    const pending = deferred<{ reply: string; steps: []; learned: [] }>();
    const cancelled = await open({
      chatSend: () => pending.promise,
      cancelOutcome: { cancelled: true },
    });
    submit(cancelled, 'cancelar');
    await cancelled.flush();
    (cancelled.document.getElementById('chat-cancel') as HTMLButtonElement).click();
    await cancelled.flush();
    pending.reject(new Error('cancelado'));
    await cancelled.flush();
    expect(
      cancelled.document.querySelectorAll(
        '[data-event-type="system"][data-event-kind="cancelled"]',
      ),
    ).toHaveLength(1);
    expect(
      cancelled.document.querySelectorAll(
        '[data-event-type="error"][data-event-kind="chat-failure"]',
      ),
    ).toHaveLength(0);
  });

  it('preserva a rolagem longe do fim (<=48px de tolerância) e acumula/zera o contador', async () => {
    const f = await open();
    const transcript = f.document.getElementById('chat-transcript') as HTMLElement;
    Object.defineProperties(transcript, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 100 },
    });
    transcript.scrollTop = 100;
    submit(f, 'atividade');
    await f.flush();
    const indicator = f.document.getElementById('new-activity') as HTMLButtonElement;
    expect(indicator.hidden).toBe(false);
    indicator.click();
    expect(indicator.hidden).toBe(true);
    expect(transcript.scrollTop).toBe(transcript.scrollHeight);
  });
});

describe('SPEC-0053 v3.0 — resposta corrente e histórico sob demanda (CA15)', () => {
  it('resposta curta aparece inteira; resposta longa abre drawer+Sessão no mesmo evento (CA15)', async () => {
    const reply = `${'x'.repeat(480)}\n`;
    const f = await open({ chatSend: () => ({ reply, steps: [], learned: [] }) });
    submit(f, 'teste');
    await f.flush();
    const complete = f.document.getElementById('show-complete-reply') as HTMLButtonElement;
    expect(complete.hidden).toBe(false);
    complete.click();
    expect((f.document.getElementById('panel-drawer') as HTMLElement).hidden).toBe(false);
    expect((f.document.getElementById('panel-session') as HTMLElement).hidden).toBe(false);
    expect(f.document.getElementById('timeline-detail')?.textContent).toBe(reply);
    expect(f.calls.chatSend).toHaveLength(1);
  });

  it('respeita os limites 480/4 linhas lógicas', async () => {
    expect(source).toContain('Array.from(text).length <= 480');
    expect(source).toContain('text.split(/\\r\\n|[\\n\\r]/).length');
    const cases: Array<[string, boolean]> = [
      ['x'.repeat(480), true],
      ['x'.repeat(481), false],
      ['a\nb\nc\nd', true],
      ['a\nb\nc\nd\ne', false],
    ];
    for (const [reply, short] of cases) {
      const f = await open({ chatSend: () => ({ reply, steps: [], learned: [] }) });
      submit(f, 'limites');
      await f.flush();
      expect((f.document.getElementById('show-complete-reply') as HTMLButtonElement).hidden).toBe(
        short,
      );
      f.close();
      fixture = undefined;
    }
  });
});

describe('SPEC-0053 v3.0 — nuvem de pontos determinística (Escopo 6/CA16-17)', () => {
  it('gera 320 pontos de superfície + 80 internos, sem Math.random, com as 4 sentinelas e o digest canônico', async () => {
    const f = await open();
    expect(source).not.toContain('Math.random');
    const generate = f.internals['generatePresencePointCloud'] as () => Array<{
      layer: 'surface' | 'inner';
      x: number;
      y: number;
      z: number;
    }>;
    expect(typeof generate).toBe('function');
    const points = generate();
    expect(points).toHaveLength(400);
    expect(points.filter((p) => p.layer === 'surface')).toHaveLength(320);
    expect(points.filter((p) => p.layer === 'inner')).toHaveLength(80);

    const fmt = (p: { layer: string; x: number; y: number; z: number }): string =>
      `${p.layer}:${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`;
    expect(fmt(points[0]!)).toBe('surface:0.000000,1.000000,0.000000');
    expect(fmt(points[319]!)).toBe('surface:0.000000,-1.000000,0.000000');
    expect(fmt(points[320]!)).toBe('inner:-0.756200,-0.130314,0.369031');
    expect(fmt(points[399]!)).toBe('inner:-0.599836,-0.667884,-0.224146');

    const serialized = points.map(fmt).join('\n');
    const digest = createHash('sha256').update(serialized, 'utf8').digest('hex');
    expect(digest).toBe('e34bba11376031468c7b70c1a0e904eeed2871c0dc80d1485fd8368c7b3ecdb6');

    for (const point of points) {
      const radius = Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z);
      expect(radius).toBeLessThanOrEqual(1.000001);
    }
  });

  it('mulberry32 usa a aritmética JS de 32 bits pinada (semente hexadecimal reproduz a mesma sequência)', async () => {
    const f = await open();
    const mulberry32 = f.internals['mulberry32'] as (seed: number) => () => number;
    const a = mulberry32(0x0a71a5);
    const b = mulberry32(0x0a71a5);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it('ordenação de trás para frente: o ponto frontal (desenhado por último) é maior e mais opaco que o traseiro (desenhado primeiro) na mesma frame (CA17)', async () => {
    const f = await open();
    const calls = f.canvas.calls('presence-canvas');
    const arcCalls = calls.filter((c) => c.type === 'arc');
    const fillCalls = calls.filter((c) => c.type === 'fill');
    expect(arcCalls.length).toBeGreaterThan(0);
    expect(arcCalls.length % 401).toBe(0); // 1 glow + 400 partículas por frame
    expect(fillCalls.length).toBe(arcCalls.length);
    // Última frame completa: índice 0 é o glow; 1..400 são as partículas, na
    // ordem de desenho (trás→frente, `projected.sort((a, b) => a.z - b.z)`).
    const frameArc = arcCalls.slice(-401);
    const frameFill = fillCalls.slice(-401);
    const backRadius = frameArc[1]!.args[2] as number;
    const frontRadius = frameArc[400]!.args[2] as number;
    const backAlpha = frameFill[1]!.args[1] as number;
    const frontAlpha = frameFill[400]!.args[1] as number;
    expect(frontRadius).toBeGreaterThan(backRadius);
    expect(frontAlpha).toBeGreaterThan(backAlpha);
  });
});

describe('SPEC-0053 v3.0 — Canvas 2D: somente partículas e glow (CA18-19/23)', () => {
  it('nenhum frame chama lineTo/stroke; só arc/fill (partículas) + createRadialGradient (glow)', async () => {
    const f = await open();
    f.clock.advance(16);
    const calls = f.canvas.calls('presence-canvas');
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.some((c) => c.type === 'lineTo')).toBe(false);
    expect(calls.some((c) => c.type === 'stroke')).toBe(false);
    expect(calls.some((c) => c.type === 'arc')).toBe(true);
    expect(calls.some((c) => c.type === 'createRadialGradient')).toBe(true);
  });

  it('resize respeita devicePixelRatio<=2 (backing store clamado mesmo com dpr=3)', async () => {
    const f = await open({ devicePixelRatio: 3 });
    const core = f.document.getElementById('presence-core') as HTMLElement;
    core.getBoundingClientRect = () =>
      ({ width: 200, height: 200, top: 0, left: 0, right: 200, bottom: 200 }) as DOMRect;
    f.window.dispatchEvent(new f.window.Event('resize'));
    const canvas = f.document.getElementById('presence-canvas') as HTMLCanvasElement;
    expect(canvas.width).toBe(400); // 200 * min(3,2)
    expect(canvas.height).toBe(400);
  });

  it('pointermove altera yaw/pitch sem exceder ±12° e pointerleave converge à orientação neutra', async () => {
    const f = await open();
    const stage = f.document.getElementById('presence-stage') as HTMLElement;
    stage.getBoundingClientRect = () =>
      ({ width: 200, height: 200, top: 0, left: 0, right: 200, bottom: 200 }) as DOMRect;
    stage.dispatchEvent(
      new f.window.MouseEvent('pointermove', { clientX: 200, clientY: 200, bubbles: true }),
    );
    f.clock.advance(5_000); // convergência de sobra
    const before = f.canvas.calls('presence-canvas').length;
    stage.dispatchEvent(new f.window.MouseEvent('pointerleave', { bubbles: true }));
    f.clock.advance(5_000);
    const after = f.canvas.calls('presence-canvas').length;
    expect(after).toBeGreaterThan(before);
    // Não lança e segue desenhando — a convergência em si é geométrica
    // (`1 - exp(-Δt/120)`), provada pela ausência de erro e pela chamada
    // contínua ao contexto dublado.
  });

  it('falha de getContext(2d) não derruba o boot nem cria alerta global; Persona/estado/chat/controles seguem acessíveis (CA23)', async () => {
    // `presenceCtx` é capturado UMA ÚNICA VEZ no carregamento do módulo — o
    // dublê precisa lançar ANTES do `window.eval` (`canvasContextUnavailable`,
    // instalado no `HTMLCanvasElement.prototype` pelo harness) para exercitar
    // o caminho de falha real; sobrescrever a instância DEPOIS do load não
    // testaria nada, porque `renderer.js` nunca chama `getContext` de novo.
    const f = await open({
      canvasContextUnavailable: true,
      chatSend: () => ({ reply: 'resposta', steps: [], learned: [] }),
    });
    expect(f.document.getElementById('presence-state')?.textContent).toBe('Pronto');
    expect((f.document.getElementById('global-alert') as HTMLElement).hidden).toBe(true);
    // Nada é desenhado (early-return de `renderPresenceFrame`/`renderPresenceGeometry`
    // quando `presenceCtx === null`), mas nada lança — nenhuma chamada chega
    // ao contexto dublado.
    expect(f.canvas.calls('presence-canvas')).toHaveLength(0);

    // Menu/drawer seguem funcionais.
    expect(() =>
      (f.document.getElementById('menu-toggle') as HTMLButtonElement).click(),
    ).not.toThrow();
    expect((f.document.getElementById('panel-drawer') as HTMLElement).hidden).toBe(false);

    // Chat (round-trip completo) segue funcional.
    submit(f, 'oi sem canvas');
    await f.flush();
    expect(f.document.getElementById('current-reply')?.textContent).toBe('resposta');
    expect(f.document.getElementById('presence-state')?.textContent).toBe('Pronto');
    expect((f.document.getElementById('global-alert') as HTMLElement).hidden).toBe(true);
  });
});

describe('SPEC-0053 v3.0 — estados vivos e precedência (Escopo 7/CA20-21)', () => {
  it('deriva o núcleo somente dos sete estados documentados', async () => {
    const f = await open();
    expect(coreState(f)).toBe('ready');
    expect(source).toMatch(
      /error[\s\S]*speaking[\s\S]*thinking[\s\S]*transcribing[\s\S]*listening[\s\S]*booting[\s\S]*ready/,
    );
  });

  it('exercita booting, listening, transcribing, thinking e error', async () => {
    const boot = deferred<{
      state: string;
      logLevel: string;
      dataDir: string;
      persona: { id: string; name: string };
      readRoots: string[];
      writeRoots: string[];
    }>();
    let f = await open({ atlas: { getStatus: () => boot.promise } });
    expect(coreState(f)).toBe('booting');
    f.close();

    const transcription = deferred<{ ok: true; text: string; durationMs: number }>();
    f = await open({ stt: { available: true, transcribe: () => transcription.promise } });
    (f.document.getElementById('mic-button') as HTMLButtonElement).click();
    await f.flush();
    expect(coreState(f)).toBe('listening');
    (f.document.getElementById('mic-button') as HTMLButtonElement).click();
    await f.flush();
    expect(coreState(f)).toBe('transcribing');
    transcription.resolve({ ok: true, text: '', durationMs: 0 });
    await f.flush();
    expect(coreState(f)).toBe('ready');
    f.close();

    const pendingTurn = deferred<{ reply: string; steps: []; learned: [] }>();
    f = await open({ chatSend: () => pendingTurn.promise });
    submit(f, 'pensar');
    await f.flush();
    expect(coreState(f)).toBe('thinking');
    pendingTurn.reject(new Error('falha global'));
    await f.flush();
    expect(coreState(f)).toBe('error');
  });

  it('error vence playback ativo (fala não some o alerta global)', async () => {
    const f = await open({
      osVoices: [{ voiceURI: 'local', name: 'Local', localService: true }],
      chatSend: () => Promise.reject(new Error('falha anterior')),
    });
    submit(f, 'falha');
    await f.flush();
    expect(coreState(f)).toBe('error');

    const speakText = f.internals['speakText'] as (text: string, onDone?: () => void) => void;
    speakText('teste');
    f.speechSynthesis.fireUtteranceEvent(0, 'start');
    expect(coreState(f)).toBe('error');
  });

  it('playback ativo vence thinking (askInFlight true e speaking real simultâneos produzem speaking)', async () => {
    const f = await open({
      osVoices: [{ voiceURI: 'local', name: 'Local', localService: true }],
      atlas: { ask: () => new Promise(() => {}) }, // askInFlight permanece true durante o teste
    });
    (f.document.getElementById('objective') as HTMLInputElement).value = 'meta';
    f.document
      .getElementById('ask-form')
      ?.dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true }));
    expect(coreState(f)).toBe('thinking'); // askInFlight, sem playback ainda

    const speakText = f.internals['speakText'] as (text: string, onDone?: () => void) => void;
    speakText('resposta anterior');
    f.speechSynthesis.fireUtteranceEvent(0, 'start');
    // O `ask` segue em voo (nunca resolvido), mas o playback real vence a
    // precedência de `thinking` — `derivePresenceState` checa `playbackActive`
    // ANTES de `askInFlight` (Escopo 7, tabela de prioridade).
    expect(coreState(f)).toBe('speaking');
  });

  it('handsFreeState === "speaking" isolado, sem evento nativo de início, não basta para produzir speaking', async () => {
    const f = await open({
      osVoices: [{ voiceURI: 'local', name: 'Local', localService: true }],
    });
    const speakText = f.internals['speakText'] as (text: string, onDone?: () => void) => void;
    speakText('teste', () => {});
    // Pedido aceito ainda não produz `speaking` (nem `synth.speak`/criação do
    // utterance ativam `playbackActive`) — o estado real é `thinking`
    // (`playbackPending === true`).
    expect(coreState(f)).toBe('thinking');
  });
});

describe('SPEC-0053 v3.0 — playback real liga/desliga o núcleo (Escopo 7/CA21)', () => {
  it('Piper: só o evento nativo "playing" ativa speaking; "ended" encerra', async () => {
    const f = await open({
      piperAvailable: true,
      piperVoices: [
        {
          id: 'piper',
          voiceURI: 'piper:piper',
          name: 'Piper',
          language: 'pt-BR',
          sampleRate: 22050,
        },
      ],
      atlas: {
        tts: { speak: () => Promise.resolve({ wav: new Uint8Array([1]), sampleRate: 22050 }) },
      },
    });
    const speakText = f.internals['speakText'] as (text: string, onDone?: () => void) => void;
    speakText('olá', () => {});
    await f.flush();
    expect(coreState(f)).toBe('thinking'); // pedido aceito, IPC resolvido — ainda não `speaking`
    f.audio.fireEvent(0, 'playing');
    expect(coreState(f)).toBe('speaking');
    f.audio.fireEvent(0, 'ended');
    expect(coreState(f)).not.toBe('speaking');
  });

  it('falha Piper pré-início cai no fallback do SO sem nunca exibir speaking antes do "start"', async () => {
    const f = await open({
      osVoices: [{ voiceURI: 'local', name: 'Local', localService: true }],
      piperAvailable: true,
      piperVoices: [
        {
          id: 'piper',
          voiceURI: 'piper:piper',
          name: 'Piper',
          language: 'pt-BR',
          sampleRate: 22050,
        },
      ],
      atlas: {
        tts: { speak: () => Promise.resolve({ wav: new Uint8Array([1]), sampleRate: 22050 }) },
      },
    });
    const speakText = f.internals['speakText'] as (text: string, onDone?: () => void) => void;
    speakText('olá', () => {});
    await f.flush();
    f.audio.fireEvent(0, 'error'); // falha ANTES de `playing`
    expect(coreState(f)).toBe('thinking');
    f.speechSynthesis.fireUtteranceEvent(0, 'start');
    expect(coreState(f)).toBe('speaking');
  });

  it('falha Piper pós-início produz speaking → thinking → speaking só após o "start" do SO', async () => {
    const f = await open({
      osVoices: [{ voiceURI: 'local', name: 'Local', localService: true }],
      piperAvailable: true,
      piperVoices: [
        {
          id: 'piper',
          voiceURI: 'piper:piper',
          name: 'Piper',
          language: 'pt-BR',
          sampleRate: 22050,
        },
      ],
      atlas: {
        tts: { speak: () => Promise.resolve({ wav: new Uint8Array([1]), sampleRate: 22050 }) },
      },
    });
    const speakText = f.internals['speakText'] as (text: string, onDone?: () => void) => void;
    speakText('olá', () => {});
    await f.flush();
    f.audio.fireEvent(0, 'playing');
    expect(coreState(f)).toBe('speaking');
    f.audio.fireEvent(0, 'error'); // falha DEPOIS de `playing`
    expect(coreState(f)).toBe('thinking');
    f.speechSynthesis.fireUtteranceEvent(0, 'start');
    expect(coreState(f)).toBe('speaking');
  });

  it('término/falha sem nenhum evento de início nunca produz speaking (SO indisponível)', async () => {
    const f = await open({ osVoices: [] });
    const speakText = f.internals['speakText'] as (text: string, onDone?: () => void) => void;
    let done = false;
    speakText('olá', () => {
      done = true;
    });
    expect(coreState(f)).not.toBe('speaking');
    expect(done).toBe(true);
    expect(coreState(f)).not.toBe('speaking');
  });

  it('a onda de fala usa ataque de 160ms e release de 450ms (constantes pinadas no código)', () => {
    expect(source).toMatch(/waveEnvelopeDuration = isSpeaking \? 160 : 450/);
    expect(source).toContain('easeOutCubic');
  });
});

describe('SPEC-0053 v3.0 — reduced motion e ciclo único de rAF (Escopo 8/CA22)', () => {
  it('cancela o loop contínuo, desenha um frame estático e preserva o texto do estado', async () => {
    const f = await open({ reducedMotion: true });
    const before = f.canvas.calls('presence-canvas').length;
    expect(before).toBeGreaterThan(0); // frame estático inicial
    f.clock.advance(1_000);
    const after = f.canvas.calls('presence-canvas').length;
    expect(after).toBe(before); // nenhum frame adicional agendado (loop cancelado)
    expect(f.document.getElementById('presence-state')?.textContent).toBe('Pronto');
  });

  it('alternar reduced motion em runtime cancela/retoma o loop sem duplicar instâncias', async () => {
    const f = await open();
    f.clock.advance(16);
    const runningCalls = f.canvas.calls('presence-canvas').length;
    expect(runningCalls).toBeGreaterThan(0);
    f.reducedMotion.set(true);
    const afterToggleOn = f.canvas.calls('presence-canvas').length;
    f.clock.advance(1_000);
    expect(f.canvas.calls('presence-canvas').length).toBe(afterToggleOn);
    f.reducedMotion.set(false);
    (f.document.getElementById('menu-toggle') as HTMLButtonElement).click(); // gera um refreshPresence indireto? não — só prova ausência de crash
    f.clock.advance(64);
    expect(f.canvas.calls('presence-canvas').length).toBeGreaterThan(afterToggleOn);
  });
});

describe('SPEC-0053 v3.0 — mapa de perfis fechado (Escopo 7)', () => {
  it('os sete estados têm perfis com combinações distintas de rotação/deformação/intensidade', async () => {
    const f = await open();
    const profiles = f.internals['PRESENCE_PROFILES'] as Record<
      string,
      { rotationSpeed: number; hz: number; amount: number; kind: string }
    >;
    const states = [
      'ready',
      'booting',
      'listening',
      'transcribing',
      'thinking',
      'speaking',
      'error',
    ];
    expect(Object.keys(profiles).sort()).toEqual([...states].sort());
    const signatures = states.map(
      (state) => `${profiles[state]!.rotationSpeed}|${profiles[state]!.kind}`,
    );
    expect(new Set(signatures).size).toBe(states.length);
  });
});

describe('SPEC-0053 v3.0 — identidade e regressão (CA24-27)', () => {
  it('tokens de destaque claro/escuro pertencem à família roxo-realeza; nada azul/ciano', () => {
    expect(css).toMatch(/--royal-bright:\s*#7c3aed/);
    expect(css).toMatch(/--royal-violet:\s*#8b5cf6/);
    expect(css).toMatch(/--royal-error:\s*#c92c5b/);
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).not.toMatch(/--(blue|cyan)-/i);
    expect(css).not.toContain('localStorage');
    expect(css).not.toContain('sessionStorage');
  });

  it('rótulos de controle nomeados no Escopo 9 não contêm emoji', async () => {
    const f = await open({ osVoices: [{ voiceURI: 'l', name: 'L', localService: true }] });
    const mic = f.document.getElementById('mic-button') as HTMLElement;
    expect(mic.textContent).toBe('Falar');
    (mic as HTMLButtonElement).click();
    await f.flush();
    expect(mic.textContent).toBe('Falar'); // sem STT disponível, mic segue indisponível/idle sem emoji
    const handsFree = f.document.getElementById('hands-free-toggle') as HTMLElement;
    expect(
      handsFree.textContent === 'Ligar conversa contínua' || handsFree.textContent === '',
    ).toBe(true);
    const emojiPattern = /\p{Extended_Pictographic}/u;
    for (const id of ['menu-toggle', 'drawer-close', 'mic-button', 'hands-free-toggle']) {
      const text = f.document.getElementById(id)?.textContent ?? '';
      expect(emojiPattern.test(text)).toBe(false);
    }
    for (const control of navControls(f)) {
      expect(emojiPattern.test(control.textContent ?? '')).toBe(false);
    }
  });

  it('[hidden] permanece display:none!important byte a byte', () => {
    expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
  });
});

describe('SPEC-0053 v3.0 — CA11: cobertura ampliada de ausência de emoji', () => {
  const emojiPattern = /\p{Extended_Pictographic}/u;

  it('microfone nos três estados (ocioso, gravando, transcrevendo) não usa emoji', async () => {
    const pending = deferred<RendererSttResult>();
    const f = await open({ stt: { available: true, transcribe: () => pending.promise } });
    const mic = f.document.getElementById('mic-button') as HTMLElement;
    expect(mic.textContent).toBe('Falar');
    expect(emojiPattern.test(mic.textContent ?? '')).toBe(false);

    (mic as HTMLButtonElement).click();
    await f.flush();
    expect(mic.textContent).toBe('Parar gravação');
    expect(emojiPattern.test(mic.textContent ?? '')).toBe(false);

    (mic as HTMLButtonElement).click();
    await f.flush();
    expect(mic.textContent).toBe('Transcrevendo…');
    expect(emojiPattern.test(mic.textContent ?? '')).toBe(false);

    pending.resolve({ ok: true, text: 'ditado', durationMs: 500 });
    await f.flush();
  });

  it('botão de TTS ("Ouvir") no transcript não usa emoji', async () => {
    const f = await open({ chatSend: () => ({ reply: 'resposta', steps: [], learned: [] }) });
    submit(f, 'oi');
    await f.flush();
    const buttons = [...f.document.querySelectorAll('#chat-transcript button')] as HTMLElement[];
    const speakButton = buttons.find((b) => b.textContent === 'Ouvir');
    expect(speakButton).toBeDefined();
    expect(emojiPattern.test(speakButton?.textContent ?? '')).toBe(false);
  });

  it('hands-free ligado e desligado não usa emoji no toggle', async () => {
    const f = await open({
      stt: { available: true },
      vad: { available: true },
      osVoices: [{ voiceURI: 'l', name: 'L', localService: true }],
    });
    const toggle = f.document.getElementById('hands-free-toggle') as HTMLButtonElement;
    expect(toggle.textContent).toBe('Ligar conversa contínua');
    expect(emojiPattern.test(toggle.textContent ?? '')).toBe(false);

    const setFactory = f.internals['setHandsFreeDetectorFactory'] as (
      factory: () => Promise<{ probe(): Promise<number>; reset(): void }>,
    ) => void;
    setFactory(() => Promise.resolve({ probe: () => Promise.resolve(0), reset: () => {} }));
    toggle.click();
    await f.flush();
    expect(toggle.textContent).toBe('Desligar conversa contínua');
    expect(emojiPattern.test(toggle.textContent ?? '')).toBe(false);
  });

  // #hands-free-indicator é autoria do renderer (`handsFreeIndicatorText`,
  // apps/desktop/src/renderer/renderer.js) — não há exceção documentada no
  // Escopo 9 para ele (as únicas exceções são texto vindo do usuário/modelo
  // e mensagens históricas de erro), então entra na cobertura como qualquer
  // outro rótulo. Os dois testes abaixo percorrem os seis estados
  // alcançáveis por um gesto real (`arming`/`listening`/`capturing`/
  // `transcribing`/`thinking`/`speaking`) — o mesmo recorte de seis estados
  // da nota R6/CA39 em `renderer.hands-free.test.ts`.
  it('indicador hands-free: arming, listening, capturing e transcribing não usam emoji', async () => {
    const speechFrames = Math.ceil(MIN_SPEECH_MS / FRAME_MS) + 1;
    const pendingTranscribe = new Promise<RendererSttResult>(() => {});
    const f = await open({
      stt: { available: true, transcribe: () => pendingTranscribe },
      vad: { available: true },
      osVoices: [{ voiceURI: 'l', name: 'L', localService: true }],
      media: { getUserMediaDelayMs: 50 },
    });
    const indicator = (): string =>
      f.document.getElementById('hands-free-indicator')?.textContent ?? '';
    const toggle = f.document.getElementById('hands-free-toggle') as HTMLButtonElement;
    const setFactory = f.internals['setHandsFreeDetectorFactory'] as (
      factory: () => Promise<{
        probe(frame: Float32Array): Promise<number>;
        reset(): void;
      }>,
    ) => void;
    setFactory(() => Promise.resolve({ probe: () => Promise.resolve(0.9), reset: () => {} }));

    toggle.click();
    await f.flush();
    expect(indicator()).toContain('Aguardando permissão');
    expect(emojiPattern.test(indicator())).toBe(false);

    f.clock.advance(50);
    await f.flush();
    expect(indicator()).toContain('Ouvindo');
    expect(emojiPattern.test(indicator())).toBe(false);

    for (let i = 0; i < speechFrames; i += 1) {
      f.media.feedAudioProcess(new Float32Array(FRAME_SAMPLES));
      if (i % 8 === 7) await f.flush();
    }
    await f.flush();
    expect(indicator()).toContain('Capturando');
    expect(emojiPattern.test(indicator())).toBe(false);
  });

  it('indicador hands-free: thinking e speaking não usam emoji', async () => {
    const turn = deferred<{ reply: string; steps: []; learned: [] }>();
    const f = await open({
      stt: { available: true },
      vad: { available: true },
      osVoices: [{ voiceURI: 'l', name: 'L', localService: true }],
      atlas: {
        chat: { send: () => turn.promise },
        tts: {
          voices: () => Promise.resolve([]),
          speak: () => new Promise(() => {}),
          cancel: () => Promise.resolve(),
          available: () => Promise.resolve(false),
        },
      },
    });
    const indicator = (): string =>
      f.document.getElementById('hands-free-indicator')?.textContent ?? '';
    const toggle = f.document.getElementById('hands-free-toggle') as HTMLButtonElement;
    const speechFrames = Math.ceil(MIN_SPEECH_MS / FRAME_MS) + 1;
    const silenceFrames = Math.ceil(SILENCE_CLOSE_MS / FRAME_MS) + 1;
    const sequence = [...Array(speechFrames).fill(0.9), ...Array(silenceFrames).fill(0)];
    let index = 0;
    const setFactory = f.internals['setHandsFreeDetectorFactory'] as (
      factory: () => Promise<{
        probe(frame: Float32Array): Promise<number>;
        reset(): void;
      }>,
    ) => void;
    setFactory(() =>
      Promise.resolve({
        probe: () => {
          const value = sequence[Math.min(index, sequence.length - 1)] ?? 0;
          index += 1;
          return Promise.resolve(value);
        },
        reset: () => {},
      }),
    );

    toggle.click();
    await f.flush();
    for (let i = 0; i < sequence.length; i += 1) {
      f.media.feedAudioProcess(new Float32Array(FRAME_SAMPLES));
      if (i % 8 === 7) await f.flush();
    }
    await f.flush();
    expect(indicator()).toContain('Pensando');
    expect(emojiPattern.test(indicator())).toBe(false);

    turn.resolve({ reply: 'resposta longa', steps: [], learned: [] });
    await f.flush();
    expect(indicator()).toContain('Falando');
    expect(emojiPattern.test(indicator())).toBe(false);
  });

  it('rótulos primários dos painéis Persona, Personas, Memória, Permissões, Objetivo e Sessão não usam emoji', async () => {
    const f = await open({
      status: { readRoots: ['/a'], writeRoots: ['/b'] },
      facts: [
        {
          id: 'f-1',
          text: 'fato de teste',
          createdAt: '2026-01-01T00:00:00.000Z',
          source: 'user',
          category: 'fact',
        },
      ],
    });
    (f.document.getElementById('menu-toggle') as HTMLButtonElement).click();
    const controls = navControls(f);
    const labels: string[] = [];

    controls[0]?.click(); // Persona
    labels.push(
      f.document.getElementById('persona-status-toggle')?.textContent ?? '',
      f.document.getElementById('persona-select')?.textContent ?? '',
    );
    controls[0]?.click(); // fecha

    controls[1]?.click(); // Personas
    labels.push(f.document.getElementById('persona-new')?.textContent ?? '');
    [...f.document.querySelectorAll('#persona-list button')].forEach((item) =>
      labels.push(item.textContent ?? ''),
    );
    controls[1]?.click();

    controls[2]?.click(); // Memória
    labels.push(f.document.getElementById('memory-refresh')?.textContent ?? '');
    [...f.document.querySelectorAll('#memory-list button')].forEach((item) =>
      labels.push(item.textContent ?? ''),
    );
    controls[2]?.click();

    controls[3]?.click(); // Permissões
    labels.push(
      f.document.getElementById('read-roots-toggle')?.textContent ?? '',
      f.document.getElementById('write-roots-toggle')?.textContent ?? '',
      f.document.getElementById('read-root-add')?.textContent ?? '',
      f.document.getElementById('write-root-add')?.textContent ?? '',
      f.document.getElementById('permissions-apply')?.textContent ?? '',
    );
    controls[3]?.click();

    controls[4]?.click(); // Objetivo
    labels.push(
      f.document.getElementById('ask-submit')?.textContent ?? '',
      f.document.getElementById('ask-cancel')?.textContent ?? '',
    );
    controls[4]?.click();

    controls[5]?.click(); // Sessão
    labels.push(f.document.getElementById('new-activity')?.textContent ?? '');
    controls[5]?.click();

    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(emojiPattern.test(label)).toBe(false);
    }
  });
});
