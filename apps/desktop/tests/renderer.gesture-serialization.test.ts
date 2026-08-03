import { afterEach, describe, expect, it } from 'vitest';
import type {
  RendererAskSnapshot,
  RendererFixture,
  RendererFixtureOptions,
  RendererTurnSnapshot,
} from './helpers/renderer-harness.js';
import { loadRenderer } from './helpers/renderer-harness.js';

// SPEC-0047, Frente 5: serialização de gestos — um turno por vez, e nenhum
// controle fica travado depois de um erro.
//
// A lista de controles serializados é a nomeada no cabeçalho da Frente 5 da
// SPEC (CA 19):
//   #chat-input · #chat-send · #persona-select · #persona-new ·
//   botões de #persona-list · #persona-form-save · #persona-form-cancel ·
//   #read-root-add · #write-root-add · #permissions-apply
//
// ACHADO registrado no relatório final do `spec-implementer`: essa lista
// vale integralmente para um TURNO DE CHAT em voo (a suíte abaixo confirma),
// mas NÃO para um `ask` em voo. `askInFlight` alimenta
// `refreshPermissionsPanelState()` → `refreshPersonaPanelState()` +
// `refreshChatControlsForMic()`, e esta última só soma `askInFlight` à
// condição de `#persona-select` (`disabled = disabled || askInFlight`) — o
// botão `#chat-send` usa só `chatTurnInFlight || micBusy()`, sem
// `askInFlight`, e `#chat-input` nunca é tocado fora do próprio manipulador
// de envio de chat. Ou seja: durante um `ask` em voo, `#chat-input` e
// `#chat-send` permanecem HABILITADOS na implementação real. A SPEC previu
// exatamente este caso ("corrigir a lista nesta SPEC — nunca 'consertar' o
// renderer"): a suíte abaixo testa os dois cenários com listas distintas,
// documentando o gap em vez de escondê-lo.

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

interface DisableableElement {
  readonly id?: string;
  disabled: boolean;
}

const STATIC_SERIALIZED_IDS = [
  'chat-input',
  'chat-send',
  'persona-select',
  'persona-new',
  'persona-form-save',
  'persona-form-cancel',
  'read-root-add',
  'write-root-add',
  'permissions-apply',
] as const;

function collectSerializedControls(f: RendererFixture): DisableableElement[] {
  const staticEls = STATIC_SERIALIZED_IDS.map(
    (id) => f.document.getElementById(id) as unknown as DisableableElement,
  );
  const personaListButtons = [
    ...f.document.querySelectorAll('#persona-list button'),
  ] as unknown as DisableableElement[];
  return [...staticEls, ...personaListButtons];
}

function collectAskSerializedControls(f: RendererFixture): DisableableElement[] {
  // ACHADO (ver cabeçalho): #chat-input/#chat-send não fazem parte da
  // serialização real de `ask` — excluídos deliberadamente aqui.
  return collectSerializedControls(f).filter(
    (el) => el.id !== 'chat-input' && el.id !== 'chat-send',
  );
}

function expectAllDisabled(elements: readonly DisableableElement[], expected: boolean): void {
  expect(elements.length).toBeGreaterThan(0);
  for (const el of elements) {
    expect(el.disabled, `esperado disabled=${expected} em #${el.id ?? '(sem id)'}`).toBe(expected);
  }
}

async function submitChat(f: RendererFixture, text: string): Promise<void> {
  setValue(f, 'chat-input', text);
  f.document
    .getElementById('chat-form')
    ?.dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true }));
}

function submitAsk(f: RendererFixture, objective: string): void {
  setValue(f, 'objective', objective);
  f.document
    .getElementById('ask-form')
    ?.dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true }));
}

const PERSONAS_WITH_CUSTOM = [
  { id: 'jarvis', name: 'Jarvis', builtin: true },
  { id: 'custom-1', name: 'Custom Um', builtin: false },
];

describe('serialização de gestos — turno de chat em voo', () => {
  it('todos os controles da lista ficam desabilitados durante o turno, e reabilitados ao assentar', async () => {
    let resolveSend: ((value: RendererTurnSnapshot) => void) | undefined;
    const sendPromise = new Promise<RendererTurnSnapshot>((resolve) => {
      resolveSend = resolve;
    });
    const f = await open({
      personas: PERSONAS_WITH_CUSTOM,
      chatSend: () => sendPromise,
    });

    await submitChat(f, 'olá');

    expectAllDisabled(collectSerializedControls(f), true);

    resolveSend?.({ reply: 'oi', steps: [], learned: [] });
    await f.flush();

    expectAllDisabled(collectSerializedControls(f), false);
  });
});

describe('serialização de gestos — ask em voo', () => {
  it('a mesma lista (exceto #chat-input/#chat-send, achado registrado) fica desabilitada durante o ask, e reabilitada ao assentar', async () => {
    let resolveAsk: ((value: RendererAskSnapshot) => void) | undefined;
    const askPromise = new Promise<RendererAskSnapshot>((resolve) => {
      resolveAsk = resolve;
    });
    const f = await open({
      personas: PERSONAS_WITH_CUSTOM,
      atlas: { ask: () => askPromise },
    });

    submitAsk(f, 'faça algo');

    expectAllDisabled(collectAskSerializedControls(f), true);
    // Achado: #chat-input/#chat-send NÃO entram na serialização real de `ask`.
    expect(
      (f.document.getElementById('chat-input') as unknown as { disabled: boolean }).disabled,
    ).toBe(false);
    expect(
      (f.document.getElementById('chat-send') as unknown as { disabled: boolean }).disabled,
    ).toBe(false);

    resolveAsk?.({ text: 'pronto', steps: [], learned: [] });
    await f.flush();

    expectAllDisabled(collectAskSerializedControls(f), false);
  });
});

describe('serialização de gestos — falha do turno', () => {
  it('chat.send rejeitando escreve o aviso no transcript e reabilita todos os controles da lista', async () => {
    const f = await open({
      personas: PERSONAS_WITH_CUSTOM,
      chatSend: () => Promise.reject(new Error('falha de envio')),
    });

    await submitChat(f, 'olá');
    expectAllDisabled(collectSerializedControls(f), true);

    await f.flush();

    const transcript = f.document.getElementById('chat-transcript')?.textContent ?? '';
    expect(transcript).toContain('⚠️');
    expectAllDisabled(collectSerializedControls(f), false);
  });
});

describe('serialização de gestos — guardas de entrada', () => {
  it('submeter #chat-form com texto vazio não chama atlas.chat.send', async () => {
    const f = await open();
    await submitChat(f, '');
    await f.flush();
    expect(f.calls.chatSend).toEqual([]);
  });

  it('submeter #chat-form sem sessão aberta não chama atlas.chat.send', async () => {
    // `chatSession` permanece `null` (valor inicial) enquanto
    // `window.atlas.chat.open()` não resolver — usa-se aqui uma promessa
    // permanentemente pendente (nunca resolve, nunca rejeita) para simular
    // "sem sessão aberta" sem provocar uma rejeição não tratada de verdade:
    // `renderer.js` encadeia só `.then(...)` na chamada inicial de
    // `chat.open()` (sem `.catch`), então uma rejeição real vazaria como
    // erro não tratado no processo — o que importa para este teste é
    // `chatSession === null` no momento do submit, garantido igualmente por
    // uma promessa pendente.
    const f = await open({
      atlas: { chat: { open: () => new Promise<string>(() => {}) } },
    });

    await submitChat(f, 'olá');
    await f.flush();

    expect(f.calls.chatSend).toEqual([]);
  });
});
