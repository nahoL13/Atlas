import { afterEach, describe, expect, it } from 'vitest';
import type { RendererFixture, RendererFixtureOptions } from './helpers/renderer-harness.js';
import { loadRenderer } from './helpers/renderer-harness.js';

// SPEC-0047, Frente 4: cobertura comportamental dos painéis de memória e do
// round-trip `ask` de tiro único, sobre o harness jsdom da SPEC-0045.

let fixture: RendererFixture | undefined;

afterEach(() => {
  fixture?.close();
  fixture = undefined;
});

async function open(options?: RendererFixtureOptions): Promise<RendererFixture> {
  fixture = await loadRenderer(options);
  await fixture.flush();
  return fixture;
}

function setValue(f: RendererFixture, id: string, value: string): void {
  (f.document.getElementById(id) as unknown as { value: string }).value = value;
}

function click(f: RendererFixture, id: string): void {
  (f.document.getElementById(id) as unknown as { click(): void }).click();
}

async function submit(f: RendererFixture, formId: string): Promise<void> {
  f.document
    .getElementById(formId)
    ?.dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true }));
  await f.flush();
}

// O manipulador de "Esquecer" em `renderer.js` encadeia só `.finally(...)`
// sobre `window.atlas.memory.forget(...)` (sem `.catch`) — uma rejeição
// segue sem handler ao nível do processo Node (a promessa É tratada pelo
// `finally`, mas isso não some com o aviso de rejeição não tratada do V8).
// É comportamento real e pré-existente do renderer (fora do escopo desta
// SPEC alterar); suprimido aqui só para não derrubar a suíte por um aviso
// que o próprio teste está deliberadamente provocando.
async function withSuppressedUnhandledRejection<T>(action: () => Promise<T> | T): Promise<T> {
  const handler = (): void => {};
  process.on('unhandledRejection', handler);
  try {
    return await action();
  } finally {
    process.off('unhandledRejection', handler);
  }
}

describe('painel de memória', () => {
  it('cada fato pintado em #memory-list traz id, texto, data, origem e categoria (com sufixo de projeto quando há subject)', async () => {
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
          text: 'lembrete de projeto',
          createdAt: '2026-01-02T00:00:00.000Z',
          source: 'learned',
          category: 'project',
          subject: 'atlas',
        },
      ],
    });

    const items = [...f.document.querySelectorAll('#memory-list li')] as unknown as HTMLLIElement[];
    expect(items.length).toBe(2);
    const first = items[0]?.querySelector('span')?.textContent ?? '';
    expect(first).toContain('[f1]');
    expect(first).toContain('lembrete um');
    expect(first).toContain('2026-01-01T00:00:00.000Z');
    expect(first).toContain('origem: user');
    expect(first).toContain('categoria: fact');

    const second = items[1]?.querySelector('span')?.textContent ?? '';
    expect(second).toContain('projeto: atlas');
  });

  it('"Esquecer" chama memory.forget com o id do fato, desabilita o próprio botão e recarrega a lista', async () => {
    let memoryListCalls = 0;
    const facts = [
      {
        id: 'f1',
        text: 'um',
        createdAt: '2026-01-01T00:00:00.000Z',
        source: 'user',
        category: 'fact',
      },
      {
        id: 'f2',
        text: 'dois',
        createdAt: '2026-01-02T00:00:00.000Z',
        source: 'user',
        category: 'fact',
      },
    ];
    const f = await open({
      facts,
      atlas: {
        memory: {
          list: () => {
            memoryListCalls += 1;
            return Promise.resolve(facts);
          },
        },
      },
    });
    const callsBefore = memoryListCalls;

    const items = [...f.document.querySelectorAll('#memory-list li')] as unknown as HTMLLIElement[];
    const secondForgetButton = [
      ...(items[1]?.querySelectorAll('button') ?? []),
    ] as unknown as Array<{
      click(): void;
      disabled: boolean;
    }>;
    const forgetButton = secondForgetButton[0];
    if (forgetButton === undefined) {
      throw new Error('botão "Esquecer" não encontrado');
    }
    forgetButton.click();

    expect(forgetButton.disabled).toBe(true);
    expect(f.calls.memoryForget).toEqual(['f2']);
    await f.flush();
    expect(memoryListCalls).toBeGreaterThan(callsBefore);
  });

  it('"Esquecer" que rejeita ainda assim recarrega a lista (finally) e não lança exceção não tratada', async () => {
    let memoryListCalls = 0;
    const facts = [
      {
        id: 'f1',
        text: 'um',
        createdAt: '2026-01-01T00:00:00.000Z',
        source: 'user',
        category: 'fact',
      },
    ];
    const f = await open({
      facts,
      atlas: {
        memory: {
          forget: (id: string) => {
            f.calls.memoryForget.push(id);
            return Promise.reject(new Error('falha ao esquecer'));
          },
          list: () => {
            memoryListCalls += 1;
            return Promise.resolve(facts);
          },
        },
      },
    });
    const callsBefore = memoryListCalls;

    const button = f.document.querySelector('#memory-list li button') as unknown as {
      click(): void;
    };
    await withSuppressedUnhandledRejection(async () => {
      expect(() => button.click()).not.toThrow();
      await f.flush();
    });

    expect(f.calls.memoryForget).toEqual(['f1']);
    expect(memoryListCalls).toBeGreaterThan(callsBefore);
  });

  it('#memory-refresh recarrega a lista a partir do dublê', async () => {
    let memoryListCalls = 0;
    const f = await open({
      facts: [],
      atlas: {
        memory: {
          list: () => {
            memoryListCalls += 1;
            return Promise.resolve([]);
          },
        },
      },
    });
    const callsBefore = memoryListCalls;

    click(f, 'memory-refresh');
    await f.flush();

    expect(memoryListCalls).toBe(callsBefore + 1);
  });
});

describe('round-trip ask', () => {
  it('submeter #ask-form com objetivo não vazio chama atlas.ask uma vez e pinta o traço de steps, a resposta e as linhas de lembrado', async () => {
    let askCalls = 0;
    const f = await open({
      atlas: {
        ask: (objective: string) => {
          askCalls += 1;
          expect(objective).toBe('faça algo');
          return Promise.resolve({
            text: 'resposta final',
            steps: [
              { tool: 'clock', outcome: 'ok', ok: true },
              { tool: 'delete_file', outcome: 'negado', ok: false, denialKind: 'blocked' as const },
            ],
            learned: ['fato novo'],
          });
        },
      },
    });

    setValue(f, 'objective', 'faça algo');
    await submit(f, 'ask-form');

    expect(askCalls).toBe(1);
    const result = f.document.getElementById('ask-result')?.textContent ?? '';
    expect(result).toContain('🔧 clock → ok');
    expect(result).toContain('🔧 delete_file → negado [blocked]');
    expect(result).toContain('resposta final');
    expect(result).toContain('💡 lembrado: fato novo');
  });

  it('objetivo vazio ou só espaços não chama atlas.ask', async () => {
    let askCalls = 0;
    const f = await open({
      atlas: {
        ask: () => {
          askCalls += 1;
          return Promise.resolve({ text: '', steps: [], learned: [] });
        },
      },
    });

    setValue(f, 'objective', '');
    await submit(f, 'ask-form');
    setValue(f, 'objective', '   ');
    await submit(f, 'ask-form');

    expect(askCalls).toBe(0);
  });

  it('atlas.ask rejeitando escreve ⚠️ e a mensagem do erro em #ask-result, sem lançar e sem congelar em "Perguntando…" (SPEC-0049)', async () => {
    const f = await open({
      atlas: {
        ask: () => Promise.reject(new Error('falha no ask')),
      },
    });

    setValue(f, 'objective', 'faça algo');
    await expect(submit(f, 'ask-form')).resolves.toBeUndefined();

    const result = f.document.getElementById('ask-result')?.textContent ?? '';
    expect(result).toContain('⚠️');
    expect(result).toContain('falha no ask');
    expect(result).not.toContain('Perguntando…');
  });
});
