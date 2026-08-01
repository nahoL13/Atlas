import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RendererFixture, RendererFixtureOptions } from './helpers/renderer-harness.js';
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
