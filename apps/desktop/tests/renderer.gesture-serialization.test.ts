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
// SPEC-0048 corrigiu o achado registrado pela SPEC-0047: `#chat-send` agora
// entra também na serialização de um `ask` em voo (`refreshChatControlsForMic`
// soma `chatTurnInFlight || askInFlight || micBusy()`), e o manipulador de
// `submit` de `#chat-form` recusa o gesto (sem chamar `atlas.chat.send`)
// enquanto `chatTurnInFlight` ou `askInFlight` for verdadeiro — guarda
// independente do atributo `disabled`, que cobre submissão implícita/
// programática do `<form>`. O `.finally` do turno de chat deixou de
// recalcular o estado de `#chat-send` por conta própria (não tem mais
// `sendButton.disabled = micBusy()`): o valor final vem só de
// `refreshChatControlsForMic()`, chamada por `refreshPermissionsPanelState()`
// logo abaixo na mesma linha de código.
//
// `#chat-input` continua DELIBERADAMENTE fora da serialização de `ask`
// (Decisão D3 da SPEC-0048): digitar não dispara gesto algum contra o Core,
// e desabilitar o campo no meio de um `ask` roubaria foco/texto em curso por
// um round-trip que não é do chat. É decisão, não gap — por isso a lista
// usada durante um `ask` (`collectAskSerializedControls`) exclui só
// `chat-input`, nunca `chat-send`.

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

// O manipulador de `#ask-form` em `renderer.js` encadeia só `.finally(...)`
// sobre `window.atlas.ask(...)` (sem `.catch`) — uma rejeição segue sem
// handler ao nível do processo Node (a promessa É tratada pelo `finally`,
// mas isso não some com o aviso de rejeição não tratada do V8). Mesmo padrão
// de `renderer.memory-ask.test.ts`.
async function withSuppressedUnhandledRejection<T>(action: () => Promise<T> | T): Promise<T> {
  const handler = (): void => {};
  process.on('unhandledRejection', handler);
  try {
    return await action();
  } finally {
    process.off('unhandledRejection', handler);
  }
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
  // D3 (ver cabeçalho): só `#chat-input` fica fora da serialização real de
  // `ask` — decisão deliberada, não gap. `#chat-send` volta à lista comum.
  return collectSerializedControls(f).filter((el) => el.id !== 'chat-input');
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
  it('a mesma lista (exceto #chat-input, D3) fica desabilitada durante o ask, e reabilitada ao assentar', async () => {
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
    // D3: só #chat-input fica fora da serialização de `ask` — decisão, não
    // gap. #chat-send agora entra (SPEC-0048).
    expect(
      (f.document.getElementById('chat-input') as unknown as { disabled: boolean }).disabled,
    ).toBe(false);
    expect(
      (f.document.getElementById('chat-send') as unknown as { disabled: boolean }).disabled,
    ).toBe(true);

    resolveAsk?.({ text: 'pronto', steps: [], learned: [] });
    await f.flush();

    expectAllDisabled(collectAskSerializedControls(f), false);
  });

  it('ask rejeitando reabilita #chat-send', async () => {
    let rejectAsk: ((error: Error) => void) | undefined;
    const askPromise = new Promise<RendererAskSnapshot>((_resolve, reject) => {
      rejectAsk = reject;
    });
    const f = await open({
      personas: PERSONAS_WITH_CUSTOM,
      atlas: { ask: () => askPromise },
    });

    submitAsk(f, 'faça algo');

    expect(
      (f.document.getElementById('chat-send') as unknown as { disabled: boolean }).disabled,
    ).toBe(true);

    await withSuppressedUnhandledRejection(async () => {
      rejectAsk?.(new Error('falha no ask'));
      await f.flush();
    });

    expect(
      (f.document.getElementById('chat-send') as unknown as { disabled: boolean }).disabled,
    ).toBe(false);
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

  it('submeter #chat-form com um ask em voo não chama atlas.chat.send; ao assentar o ask, o mesmo submit chama', async () => {
    let resolveAsk: ((value: RendererAskSnapshot) => void) | undefined;
    const askPromise = new Promise<RendererAskSnapshot>((resolve) => {
      resolveAsk = resolve;
    });
    const f = await open({
      atlas: { ask: () => askPromise },
    });

    submitAsk(f, 'faça algo');

    await submitChat(f, 'olá');
    await f.flush();
    expect(f.calls.chatSend).toEqual([]);

    resolveAsk?.({ text: 'pronto', steps: [], learned: [] });
    await f.flush();

    await submitChat(f, 'olá');
    await f.flush();
    expect(f.calls.chatSend).toEqual([{ session: 'session-1', input: 'olá' }]);
  });
});

describe('serialização de gestos — não-regressão do .finally do turno de chat', () => {
  it('um turno de chat que assenta enquanto um ask segue em voo deixa #chat-send desabilitado', async () => {
    let resolveAsk: ((value: RendererAskSnapshot) => void) | undefined;
    const askPromise = new Promise<RendererAskSnapshot>((resolve) => {
      resolveAsk = resolve;
    });
    let resolveSend: ((value: RendererTurnSnapshot) => void) | undefined;
    const sendPromise = new Promise<RendererTurnSnapshot>((resolve) => {
      resolveSend = resolve;
    });
    const f = await open({
      atlas: { ask: () => askPromise },
      chatSend: () => sendPromise,
    });

    // Sessão de chat aberta e turno disparado ANTES do ask, para que o
    // `.finally` do turno de chat assente enquanto `askInFlight` ainda é
    // verdadeiro.
    await submitChat(f, 'olá');
    submitAsk(f, 'faça algo');

    resolveSend?.({ reply: 'oi', steps: [], learned: [] });
    await f.flush();

    // O turno de chat assentou, mas o ask segue em voo: `#chat-send` precisa
    // continuar desabilitado — prova de que o `.finally` deixou de recalcular
    // o estado por conta própria (a edição 2 da Frente 1 da SPEC-0048).
    expect(
      (f.document.getElementById('chat-send') as unknown as { disabled: boolean }).disabled,
    ).toBe(true);

    resolveAsk?.({ text: 'pronto', steps: [], learned: [] });
    await f.flush();

    expect(
      (f.document.getElementById('chat-send') as unknown as { disabled: boolean }).disabled,
    ).toBe(false);
  });
});
