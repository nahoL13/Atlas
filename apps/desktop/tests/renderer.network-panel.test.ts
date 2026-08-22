import { afterEach, describe, expect, it } from 'vitest';
import type { RendererFixture, RendererFixtureOptions } from './helpers/renderer-harness.js';
import { loadRenderer } from './helpers/renderer-harness.js';

// SPEC-0059: cobertura comportamental do painel de rede/busca (dentro de
// #panel-permissions, D1) sobre o harness jsdom da SPEC-0045 — mesma
// disciplina de recusa em pé de igualdade com o sucesso (Motivação/SPEC-0038),
// exceto pela assimetria deliberada de D17: rejeição preserva o rascunho de
// rede (não recarrega as listas do status, como o bloco de FS faz).

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

function valueOf(f: RendererFixture, id: string): string {
  return (f.document.getElementById(id) as unknown as { value: string }).value;
}

function click(f: RendererFixture, id: string): void {
  (f.document.getElementById(id) as unknown as { click(): void }).click();
}

function disabledOf(f: RendererFixture, id: string): boolean {
  return (f.document.getElementById(id) as unknown as { disabled: boolean }).disabled;
}

function hiddenOf(f: RendererFixture, id: string): boolean {
  return (f.document.getElementById(id) as unknown as { hidden: boolean }).hidden;
}

function listValues(f: RendererFixture, listId: string): string[] {
  const items = [...f.document.querySelectorAll(`#${listId} li`)] as unknown as HTMLLIElement[];
  return items.map((item) => item.querySelector('span')?.textContent ?? '');
}

function errorText(f: RendererFixture): string {
  return f.document.getElementById('network-error')?.textContent ?? '';
}

function inForceText(f: RendererFixture): string {
  return f.document.getElementById('network-inforce')?.textContent ?? '';
}

function transcriptText(f: RendererFixture): string {
  return f.document.getElementById('chat-transcript')?.textContent ?? '';
}

async function addHost(f: RendererFixture, host: string): Promise<void> {
  setValue(f, 'net-root-input', host);
  click(f, 'net-root-add');
  await f.flush();
}

/**
 * `search-url-input` só atualiza o rascunho (`pendingSearchUrl`) via o
 * listener de `input` — setar `.value` sozinho (sem disparar o evento) NÃO
 * atualiza o rascunho, exatamente como um `<input>` real se comporta.
 */
async function setSearchUrl(f: RendererFixture, value: string): Promise<void> {
  setValue(f, 'search-url-input', value);
  f.document
    .getElementById('search-url-input')
    ?.dispatchEvent(new f.window.Event('input', { bubbles: true }));
  await f.flush();
}

function removeHostAt(f: RendererFixture, index: number): void {
  const buttons = [
    ...f.document.querySelectorAll('#net-roots-list li button'),
  ] as unknown as Array<{
    click(): void;
  }>;
  buttons[index]?.click();
}

describe('painel de rede/busca — arranque', () => {
  it('#net-roots-list, #search-url-input e #network-inforce são pintados a partir do getStatus(); renderStatus inclui netRoots/searchUrl', async () => {
    const f = await open({
      status: { netRoots: ['exemplo.com'], searchUrl: 'https://busca.exemplo.com/search' },
    });

    expect(listValues(f, 'net-roots-list')).toEqual(['exemplo.com']);
    expect(valueOf(f, 'search-url-input')).toBe('https://busca.exemplo.com/search');
    expect(inForceText(f)).toContain('exemplo.com');
    expect(inForceText(f)).toContain('https://busca.exemplo.com/search');

    const status = f.document.getElementById('status')?.textContent ?? '';
    expect(status).toContain('netRoots: exemplo.com');
    expect(status).toContain('searchUrl: https://busca.exemplo.com/search');
  });

  it('sem hosts/endpoint configurados, #network-inforce mostra os textos de vazio', async () => {
    const f = await open({ status: { netRoots: [], searchUrl: '' } });
    expect(inForceText(f)).toContain('(nenhum)');
    expect(inForceText(f)).toContain('(não configurada)');
  });

  it('disclosure: #net-roots-detail e #search-detail começam hidden, com aria-expanded="false" sincronizado', async () => {
    const f = await open();
    expect(hiddenOf(f, 'net-roots-detail')).toBe(true);
    expect(hiddenOf(f, 'search-detail')).toBe(true);
    expect(f.document.getElementById('net-roots-toggle')?.getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(f.document.getElementById('search-toggle')?.getAttribute('aria-expanded')).toBe('false');

    click(f, 'net-roots-toggle');
    expect(hiddenOf(f, 'net-roots-detail')).toBe(false);
    expect(f.document.getElementById('net-roots-toggle')?.getAttribute('aria-expanded')).toBe(
      'true',
    );

    click(f, 'search-toggle');
    expect(hiddenOf(f, 'search-detail')).toBe(false);
    expect(f.document.getElementById('search-toggle')?.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('painel de rede/busca — rascunho local', () => {
  it('"Adicionar" com valor não vazio acrescenta um host e limpa o input; com valor vazio ou só espaços, não acrescenta nada', async () => {
    const f = await open({ status: { netRoots: [], searchUrl: '' } });

    await addHost(f, 'exemplo.com');
    expect(listValues(f, 'net-roots-list')).toEqual(['exemplo.com']);
    expect(valueOf(f, 'net-root-input')).toBe('');

    await addHost(f, '');
    await addHost(f, '   ');
    expect(listValues(f, 'net-roots-list')).toEqual(['exemplo.com']);

    expect(f.calls.networkSelect.length).toBe(0);
  });

  it('"Remover" tira o host pelo índice certo', async () => {
    const f = await open({ status: { netRoots: [], searchUrl: '' } });

    await addHost(f, 'a.exemplo.com');
    await addHost(f, 'b.exemplo.com');
    expect(listValues(f, 'net-roots-list')).toEqual(['a.exemplo.com', 'b.exemplo.com']);

    removeHostAt(f, 0);
    await f.flush();

    expect(listValues(f, 'net-roots-list')).toEqual(['b.exemplo.com']);
    expect(f.calls.networkSelect.length).toBe(0);
  });

  it('#search-host-warning fica visível sse o rascunho de searchUrl não está vazio, e o texto avisa sobre autorização de host e ausência de autorização automática', async () => {
    const f = await open({ status: { netRoots: [], searchUrl: '' } });
    expect(hiddenOf(f, 'search-host-warning')).toBe(true);

    await setSearchUrl(f, 'https://busca.exemplo.com/search');

    expect(hiddenOf(f, 'search-host-warning')).toBe(false);
    const warning = f.document.getElementById('search-host-warning')?.textContent ?? '';
    expect(warning).toMatch(/autorizad[ao]/i);
    expect(warning).toMatch(/não autoriza nada automaticamente/i);

    click(f, 'search-url-clear');
    expect(hiddenOf(f, 'search-host-warning')).toBe(true);
    expect(valueOf(f, 'search-url-input')).toBe('');
  });
});

describe('painel de rede/busca — aplicar (sucesso)', () => {
  it('#network-apply chama network.select uma vez com o rascunho completo (substituição, nunca merge); limpa o transcript, abre nova sessão, recarrega o status e sincroniza o rascunho', async () => {
    let chatOpenCalls = 0;
    let statusCalls = 0;
    // Estado mutável — mimetiza o `core-bridge` real: `network.select`
    // aplicado atualiza o que `getStatus()` passa a reportar em vigor.
    let currentNetRoots: string[] = ['existing.com'];
    let currentSearchUrl = '';
    const f = await open({
      atlas: {
        getStatus: () => {
          statusCalls += 1;
          return Promise.resolve({
            state: 'ready',
            logLevel: 'info',
            dataDir: '/tmp/x',
            persona: { id: 'jarvis', name: 'Jarvis' },
            readRoots: ['/existing'],
            writeRoots: [],
            netRoots: currentNetRoots,
            searchUrl: currentSearchUrl,
          });
        },
        chat: {
          open: () => {
            chatOpenCalls += 1;
            return Promise.resolve(`session-${chatOpenCalls}`);
          },
        },
        network: {
          select: (access) => {
            fixture!.calls.networkSelect.push(access);
            currentNetRoots = [...access.netRoots];
            currentSearchUrl = access.searchUrl;
            return Promise.resolve(access);
          },
        },
      },
    });
    const statusCallsBefore = statusCalls;
    const chatOpenCallsBefore = chatOpenCalls;

    await addHost(f, 'new.com');
    await setSearchUrl(f, 'https://busca.exemplo.com/search');
    click(f, 'network-apply');
    await f.flush();

    expect(f.calls.networkSelect).toEqual([
      { netRoots: ['existing.com', 'new.com'], searchUrl: 'https://busca.exemplo.com/search' },
    ]);
    expect(transcriptText(f)).toContain('Rede e busca alteradas — nova conversa iniciada');
    expect(chatOpenCalls).toBe(chatOpenCallsBefore + 1);
    expect(statusCalls).toBeGreaterThan(statusCallsBefore);

    // Rascunho sincronizado com o status recém-recarregado.
    expect(listValues(f, 'net-roots-list')).toEqual(['existing.com', 'new.com']);
    expect(valueOf(f, 'search-url-input')).toBe('https://busca.exemplo.com/search');
  });
});

describe('painel de rede/busca — aplicar (recusa)', () => {
  it('promessa rejeitada escreve aviso em #network-error dizendo que nada foi aplicado; transcript intacto; chat.open não chamado; #network-inforce recarrega do status', async () => {
    let chatOpenCalls = 0;
    const f = await open({
      status: { netRoots: ['only-real.com'], searchUrl: '' },
      atlas: {
        chat: {
          open: () => {
            chatOpenCalls += 1;
            return Promise.resolve('session-1');
          },
        },
        network: {
          select: (access) => {
            fixture!.calls.networkSelect.push(access);
            return Promise.reject(new Error('host inválido'));
          },
        },
      },
    });
    const chatOpenCallsAfterLoad = chatOpenCalls;
    const transcriptBefore = transcriptText(f);

    await addHost(f, 'a b');
    click(f, 'network-apply');
    await f.flush();

    expect(errorText(f)).toContain('⚠️');
    expect(errorText(f)).toMatch(/nada foi aplicado/i);
    expect(transcriptText(f)).toBe(transcriptBefore);
    expect(chatOpenCalls).toBe(chatOpenCallsAfterLoad);
    expect(inForceText(f)).toContain('only-real.com');
  });

  it('rascunho preservado em rejeição (D17): três hosts digitados sobrevivem na mesma ordem, e o texto de busca sobrevive; corrigir e reaplicar envia a lista corrigida', async () => {
    let rejectNext = true;
    const f = await open({
      status: { netRoots: [], searchUrl: '' },
      atlas: {
        network: {
          select: (access) => {
            fixture!.calls.networkSelect.push(access);
            if (rejectNext) {
              return Promise.reject(new Error('operação em andamento'));
            }
            return Promise.resolve(access);
          },
        },
      },
    });

    await addHost(f, 'um.com');
    await addHost(f, 'dois.com');
    await addHost(f, 'tres.com');
    await setSearchUrl(f, 'https://busca.exemplo.com/search');

    click(f, 'network-apply');
    await f.flush();

    expect(errorText(f)).toContain('⚠️');
    expect(listValues(f, 'net-roots-list')).toEqual(['um.com', 'dois.com', 'tres.com']);
    expect(valueOf(f, 'search-url-input')).toBe('https://busca.exemplo.com/search');

    // Corrige (nada de fato precisa mudar aqui — só prova que reenviar
    // a lista completa funciona depois de uma rejeição) e reaplica.
    rejectNext = false;
    click(f, 'network-apply');
    await f.flush();

    expect(f.calls.networkSelect).toEqual([
      {
        netRoots: ['um.com', 'dois.com', 'tres.com'],
        searchUrl: 'https://busca.exemplo.com/search',
      },
      {
        netRoots: ['um.com', 'dois.com', 'tres.com'],
        searchUrl: 'https://busca.exemplo.com/search',
      },
    ]);
  });
});

describe('painel de rede/busca — camada de renderer do mutex (D16)', () => {
  it('com network.select pendente, #permissions-apply e #network-apply ficam desabilitados; assentada a promessa, os dois voltam a ficar habilitados', async () => {
    let resolveSelect: ((value: { netRoots: string[]; searchUrl: string }) => void) | undefined;
    const selectPromise = new Promise<{ netRoots: string[]; searchUrl: string }>((resolve) => {
      resolveSelect = resolve;
    });
    const f = await open({
      status: { netRoots: [], searchUrl: '' },
      atlas: { network: { select: () => selectPromise } },
    });

    click(f, 'network-apply');
    expect(disabledOf(f, 'network-apply')).toBe(true);
    expect(disabledOf(f, 'permissions-apply')).toBe(true);

    resolveSelect?.({ netRoots: [], searchUrl: '' });
    await f.flush();

    expect(disabledOf(f, 'network-apply')).toBe(false);
    expect(disabledOf(f, 'permissions-apply')).toBe(false);
  });

  it('simetricamente, com permissions.select pendente, os dois ficam desabilitados', async () => {
    let resolveSelect: ((value: { readRoots: string[]; writeRoots: string[] }) => void) | undefined;
    const selectPromise = new Promise<{ readRoots: string[]; writeRoots: string[] }>((resolve) => {
      resolveSelect = resolve;
    });
    const f = await open({
      status: { readRoots: ['/a'], writeRoots: [] },
      atlas: { permissions: { select: () => selectPromise } },
    });

    click(f, 'permissions-apply');
    expect(disabledOf(f, 'permissions-apply')).toBe(true);
    expect(disabledOf(f, 'network-apply')).toBe(true);

    resolveSelect?.({ readRoots: ['/a'], writeRoots: [] });
    await f.flush();

    expect(disabledOf(f, 'permissions-apply')).toBe(false);
    expect(disabledOf(f, 'network-apply')).toBe(false);
  });
});
