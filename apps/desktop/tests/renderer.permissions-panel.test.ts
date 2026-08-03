import { afterEach, describe, expect, it } from 'vitest';
import type { RendererFixture, RendererFixtureOptions } from './helpers/renderer-harness.js';
import { loadRenderer } from './helpers/renderer-harness.js';

// SPEC-0047, Frente 3: cobertura comportamental do painel de permissões
// sobre o harness jsdom da SPEC-0045. Mesma disciplina de recusa em pé de
// igualdade com o sucesso (Motivação/SPEC-0038): em recusa, o rascunho não
// sobrevive na tela — as listas voltam a refletir o status real.

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

function listValues(f: RendererFixture, listId: string): string[] {
  const items = [...f.document.querySelectorAll(`#${listId} li`)] as unknown as HTMLLIElement[];
  return items.map((item) => item.querySelector('span')?.textContent ?? '');
}

function errorText(f: RendererFixture): string {
  return f.document.getElementById('permissions-error')?.textContent ?? '';
}

function transcriptText(f: RendererFixture): string {
  return f.document.getElementById('chat-transcript')?.textContent ?? '';
}

async function addRoot(f: RendererFixture, kind: 'read' | 'write', value: string): Promise<void> {
  setValue(f, `${kind}-root-input`, value);
  click(f, `${kind}-root-add`);
  await f.flush();
}

function removeRootAt(f: RendererFixture, listId: string, index: number): void {
  const buttons = [...f.document.querySelectorAll(`#${listId} li button`)] as unknown as Array<{
    click(): void;
  }>;
  buttons[index]?.click();
}

describe('painel de permissões — rascunho local', () => {
  it('"Adicionar" com valor não vazio acrescenta um item e limpa o input; com valor vazio ou só espaços, não acrescenta nada', async () => {
    const f = await open({ status: { readRoots: [], writeRoots: [] } });

    await addRoot(f, 'read', '/a');
    expect(listValues(f, 'read-roots-list')).toEqual(['/a']);
    expect(
      (f.document.getElementById('read-root-input') as unknown as { value: string }).value,
    ).toBe('');

    await addRoot(f, 'read', '');
    await addRoot(f, 'read', '   ');
    expect(listValues(f, 'read-roots-list')).toEqual(['/a']);

    await addRoot(f, 'write', '/w');
    expect(listValues(f, 'write-roots-list')).toEqual(['/w']);

    expect(f.calls.permissionsSelect.length).toBe(0);
  });

  it('"Remover" tira o item pelo índice certo (duas raízes de mesmo prefixo, remove a clicada)', async () => {
    const f = await open({ status: { readRoots: [], writeRoots: [] } });

    await addRoot(f, 'read', '/home/a');
    await addRoot(f, 'read', '/home/ab');
    expect(listValues(f, 'read-roots-list')).toEqual(['/home/a', '/home/ab']);

    removeRootAt(f, 'read-roots-list', 0);
    await f.flush();

    expect(listValues(f, 'read-roots-list')).toEqual(['/home/ab']);
    expect(f.calls.permissionsSelect.length).toBe(0);
  });
});

describe('painel de permissões — aplicar (sucesso)', () => {
  it('#permissions-apply chama permissions.select uma vez com o rascunho completo (substituição, nunca merge); limpa o transcript, abre nova sessão e recarrega o status', async () => {
    let chatOpenCalls = 0;
    let statusCalls = 0;
    const f = await open({
      status: { readRoots: ['/existing'], writeRoots: [] },
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
          });
        },
        chat: {
          open: () => {
            chatOpenCalls += 1;
            return Promise.resolve(`session-${chatOpenCalls}`);
          },
        },
      },
    });
    const statusCallsBefore = statusCalls;
    const chatOpenCallsBefore = chatOpenCalls;

    await addRoot(f, 'write', '/new-write');
    click(f, 'permissions-apply');
    await f.flush();

    expect(f.calls.permissionsSelect).toEqual([
      { readRoots: ['/existing'], writeRoots: ['/new-write'] },
    ]);
    expect(transcriptText(f)).toContain('Permissões alteradas — nova conversa iniciada');
    expect(chatOpenCalls).toBe(chatOpenCallsBefore + 1);
    expect(statusCalls).toBeGreaterThan(statusCallsBefore);
  });
});

describe('painel de permissões — aplicar (recusa)', () => {
  it('promessa rejeitada escreve aviso em #permissions-error, deixa o #chat-transcript intacto, não abre sessão nova, e as listas voltam a refletir o status real (o rascunho recusado não permanece na tela)', async () => {
    let chatOpenCalls = 0;
    const f = await open({
      status: { readRoots: ['/only-real'], writeRoots: [] },
      atlas: {
        chat: {
          open: () => {
            chatOpenCalls += 1;
            return Promise.resolve('session-1');
          },
        },
        permissions: {
          select: (roots) => {
            f.calls.permissionsSelect.push(roots);
            return Promise.reject(new Error('caminho inválido'));
          },
        },
      },
    });
    const chatOpenCallsAfterLoad = chatOpenCalls;
    const transcriptBefore = transcriptText(f);

    await addRoot(f, 'read', '/rejected-draft');
    click(f, 'permissions-apply');
    await f.flush();

    expect(errorText(f)).toContain('⚠️');
    expect(transcriptText(f)).toBe(transcriptBefore);
    expect(chatOpenCalls).toBe(chatOpenCallsAfterLoad);
    // O rascunho recusado ('/rejected-draft') não sobrevive: a lista volta a
    // refletir só a raiz real do status.
    expect(listValues(f, 'read-roots-list')).toEqual(['/only-real']);
  });
});
