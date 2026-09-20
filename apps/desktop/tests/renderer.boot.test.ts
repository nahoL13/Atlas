import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  RendererFixture,
  RendererFixtureOptions,
  RendererModelCatalogSnapshot,
} from './helpers/renderer-harness.js';
import { loadRenderer } from './helpers/renderer-harness.js';

// Frente 4 (SPEC-0045): cobertura de arranque do renderer — carrega sem
// exceção, todo `id` referenciado existe no `index.html` real, os painéis
// pintam a partir dos dublês, e um gesto (envio de chat) chega ao IPC.

const rendererJsPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'renderer',
  'renderer.js',
);
const indexHtmlPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'renderer',
  'index.html',
);

let fixture: RendererFixture | undefined;

async function open(options?: RendererFixtureOptions): Promise<RendererFixture> {
  fixture = await loadRenderer(options);
  return fixture;
}

afterEach(() => {
  fixture?.close();
  fixture = undefined;
});

describe('arranque do renderer', () => {
  it('carrega renderer.js + index.html sem lançar exceção', async () => {
    await expect(open()).resolves.toBeDefined();
  });

  it('todo id literal referenciado por document.getElementById(...) no fonte existe no index.html', async () => {
    const rendererSource = readFileSync(rendererJsPath, 'utf8');
    const html = readFileSync(indexHtmlPath, 'utf8');

    const ids = new Set<string>();
    const idPattern = /document\.getElementById\(\s*['"]([^'"]+)['"]\s*\)/g;
    for (const match of rendererSource.matchAll(idPattern)) {
      const id = match[1];
      if (id !== undefined) {
        ids.add(id);
      }
    }
    expect(ids.size).toBeGreaterThan(0);

    for (const id of ids) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('#status reflete os campos do snapshot de status', async () => {
    const f = await open({
      status: {
        state: 'ready',
        logLevel: 'debug',
        dataDir: '/tmp/xyz',
        persona: { id: 'jarvis', name: 'Jarvis' },
        readRoots: ['/home/a'],
        writeRoots: [],
      },
    });
    await f.flush();
    const text = f.document.getElementById('status')?.textContent ?? '';
    expect(text).toContain('Atlas: ready');
    expect(text).toContain('logLevel: debug');
    expect(text).toContain('dataDir: /tmp/xyz');
    expect(text).toContain('persona: Jarvis (jarvis)');
    expect(text).toContain('readRoots: /home/a');
    expect(text).toContain('writeRoots: (nenhuma)');
  });

  it('#persona-select tem uma <option> por Persona e marca a ativa', async () => {
    const f = await open({
      status: { persona: { id: 'neutral', name: 'Neutral' } },
      personas: [
        { id: 'jarvis', name: 'Jarvis', builtin: true },
        { id: 'neutral', name: 'Neutral', builtin: true },
      ],
    });
    await f.flush();
    const select = f.document.getElementById('persona-select') as unknown as {
      options: { length: number; item(index: number): { value: string } | null };
      value: string;
    };
    expect(select.options.length).toBe(2);
    expect(select.value).toBe('neutral');
  });

  it('#persona-list tem um item por Persona do dublê', async () => {
    const f = await open({
      personas: [
        { id: 'jarvis', name: 'Jarvis', builtin: true },
        { id: 'custom-1', name: 'Custom', builtin: false },
      ],
    });
    await f.flush();
    const items = f.document.querySelectorAll('#persona-list li');
    expect(items.length).toBe(2);
  });

  it('#memory-list tem um item por fato do dublê', async () => {
    const f = await open({
      facts: [
        {
          id: 'f1',
          text: 'lembrete um',
          createdAt: '2026-01-01T00:00:00.000Z',
          source: 'user',
          category: 'fact',
        },
        {
          id: 'f2',
          text: 'lembrete dois',
          createdAt: '2026-01-02T00:00:00.000Z',
          source: 'learned',
          category: 'episode',
        },
      ],
    });
    await f.flush();
    const items = f.document.querySelectorAll('#memory-list li');
    expect(items.length).toBe(2);
  });

  it('#read-roots-list e #write-roots-list têm um item por raiz do status', async () => {
    const f = await open({
      status: { readRoots: ['/a', '/b'], writeRoots: ['/c'] },
    });
    await f.flush();
    expect(f.document.querySelectorAll('#read-roots-list li').length).toBe(2);
    expect(f.document.querySelectorAll('#write-roots-list li').length).toBe(1);
  });

  it('fiação: submeter #chat-form com texto não vazio chama atlas.chat.send com o handle aberto no carregamento e pinta a resposta', async () => {
    const f = await open({
      chatOpenSessionId: 'session-xyz',
      chatSend: (_session, input) => ({
        reply: `resposta para: ${input}`,
        steps: [],
        learned: [],
      }),
    });
    await f.flush();

    const input = f.document.getElementById('chat-input') as unknown as { value: string };
    input.value = 'olá atlas';
    const form = f.document.getElementById('chat-form');
    form?.dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true }));
    await f.flush();

    expect(f.calls.chatSend).toEqual([{ session: 'session-xyz', input: 'olá atlas' }]);
    const transcript = f.document.getElementById('chat-transcript')?.textContent ?? '';
    expect(transcript).toContain('resposta para: olá atlas');
  });
});

describe('isolamento entre casos', () => {
  beforeEach(async () => {
    fixture = await loadRenderer();
  });

  it('caso A: janela isolada, sem estado de outro caso', () => {
    expect(fixture?.calls.chatSend).toEqual([]);
  });

  it('caso B: janela isolada, sem estado de outro caso', () => {
    expect(fixture?.calls.chatSend).toEqual([]);
  });
});

// SPEC-0063 (CAs 43, 57) — gatilho proativo: no arranque, uma ÚNICA chamada a
// `window.atlas.models.probe()`, fora do tick do painel `Sistema`; abre o
// drawer no painel `Sistema` sse `probe.status === 'known'` e a lista vem
// vazia (D4/D16); espera o bootstrap de dependências assentar (D26) — o
// dublê de `models.probe()` simula essa espera.

function drawerHidden(f: RendererFixture): boolean {
  return (f.document.getElementById('panel-drawer') as HTMLElement).hidden;
}

function systemPanelHidden(f: RendererFixture): boolean {
  return (f.document.getElementById('panel-system') as HTMLElement).hidden;
}

function catalogSnapshotWith(
  probe: RendererModelCatalogSnapshot['probe'],
): RendererModelCatalogSnapshot {
  return { catalog: [], probe, install: { status: 'idle' } };
}

describe('gatilho proativo — window.atlas.models.probe() (CA43)', () => {
  it('probe known + lista vazia: abre o drawer no painel Sistema e move o foco para #model-catalog', async () => {
    const f = await open({
      modelProbeSnapshot: catalogSnapshotWith({ status: 'known', models: [] }),
    });
    await f.flush();

    expect(drawerHidden(f)).toBe(false);
    expect(systemPanelHidden(f)).toBe(false);
    expect(f.document.activeElement?.id).toBe('model-catalog');
  });

  it('fechar o drawer não o reabre (dispara uma única vez por sessão)', async () => {
    const f = await open({
      modelProbeSnapshot: catalogSnapshotWith({ status: 'known', models: [] }),
    });
    await f.flush();
    expect(drawerHidden(f)).toBe(false);

    (f.document.getElementById('drawer-close') as HTMLButtonElement).click();
    await f.flush();
    expect(drawerHidden(f)).toBe(true);

    f.clock.advance(10_000);
    await f.flush();
    expect(drawerHidden(f)).toBe(true);
  });

  it('probe known + lista NÃO vazia: o drawer não abre sozinho', async () => {
    const f = await open({
      modelProbeSnapshot: catalogSnapshotWith({ status: 'known', models: ['llama3.2:latest'] }),
    });
    await f.flush();

    expect(drawerHidden(f)).toBe(true);
  });

  it('probe unknown: o drawer não abre sozinho (fail-closed)', async () => {
    const f = await open({ modelProbeSnapshot: catalogSnapshotWith({ status: 'unknown' }) });
    await f.flush();

    expect(drawerHidden(f)).toBe(true);
  });

  it('rejeição de models.probe() é silenciosa e não abre o drawer', async () => {
    const f = await open({ atlas: { models: { probe: () => Promise.reject(new Error('boom')) } } });
    await f.flush();

    expect(drawerHidden(f)).toBe(true);
  });

  it('a abertura passa pelo controle de navegação normal — um único timer do painel Sistema é ativado', async () => {
    const f = await open({
      modelProbeSnapshot: catalogSnapshotWith({ status: 'known', models: [] }),
    });
    await f.flush();

    // A abertura reusa o `click()` do controle já existente — prova indireta:
    // o timer do painel Sistema (que só existe com o painel aberto) dispara
    // leituras a cada 2000ms, sem duplicar.
    const before = f.calls.metricsReadCalls;
    f.clock.advance(2000);
    await f.flush();
    expect(f.calls.metricsReadCalls).toBe(before + 1);
  });
});

describe('gatilho proativo — espera o bootstrap assentar, sem timer/round-trip novo (CA57)', () => {
  it('bootstrap lento: o drawer só abre DEPOIS de a promessa de probe() assentar', async () => {
    let resolveProbe: ((snapshot: RendererModelCatalogSnapshot) => void) | undefined;
    const probePromise = new Promise<RendererModelCatalogSnapshot>((resolve) => {
      resolveProbe = resolve;
    });
    const f = await open({ atlas: { models: { probe: () => probePromise } } });
    await f.flush();

    expect(drawerHidden(f)).toBe(true);

    resolveProbe?.(catalogSnapshotWith({ status: 'known', models: [] }));
    await f.flush();

    expect(drawerHidden(f)).toBe(false);
    expect(systemPanelHidden(f)).toBe(false);
  });

  it('bootstrap lento com modelo já instalado: o drawer nunca abre, mesmo depois de assentar', async () => {
    let resolveProbe: ((snapshot: RendererModelCatalogSnapshot) => void) | undefined;
    const probePromise = new Promise<RendererModelCatalogSnapshot>((resolve) => {
      resolveProbe = resolve;
    });
    const f = await open({ atlas: { models: { probe: () => probePromise } } });
    await f.flush();

    resolveProbe?.(catalogSnapshotWith({ status: 'known', models: ['x:latest'] }));
    await f.flush();

    expect(drawerHidden(f)).toBe(true);
  });
});
