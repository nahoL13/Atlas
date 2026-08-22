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
//
// SPEC-0049 fecha as duas direções residuais registradas pela SPEC-0048
// (DoD-d.1/d.2): `#ask-submit` (novo `id`, Frente 1) entra na MESMA condição
// `chatTurnInFlight || askInFlight` (`refreshAskControls`, chamada por
// `refreshPermissionsPanelState()`), e o manipulador de `submit` de
// `#ask-form` ganha guarda equivalente à de `#chat-form` — um 2º `ask`
// concorrente e um `ask` disparado durante um turno de chat são recusados
// sem chamar `window.atlas.ask`. `#objective` fica DELIBERADAMENTE fora da
// serialização (D3 desta SPEC, mesmo raciocínio de `#chat-input`): digitar
// não dispara round-trip contra o Core. O manipulador também ganhou
// `.catch`, então o helper de supressão de rejeição não tratada deixou de
// ser necessário neste arquivo — removido junto desta SPEC.

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
  'ask-submit',
  'persona-select',
  'persona-new',
  'persona-form-save',
  'persona-form-cancel',
  'read-root-add',
  'write-root-add',
  'permissions-apply',
  // SPEC-0059: controles do painel de rede/busca entram na MESMA
  // serialização (chatTurnInFlight || askInFlight).
  'net-root-input',
  'net-root-add',
  'search-url-input',
  'search-url-clear',
  'network-apply',
] as const;

function collectSerializedControls(f: RendererFixture): DisableableElement[] {
  const staticEls = STATIC_SERIALIZED_IDS.map(
    (id) => f.document.getElementById(id) as unknown as DisableableElement,
  );
  const personaListButtons = [
    ...f.document.querySelectorAll('#persona-list button'),
  ] as unknown as DisableableElement[];
  // SPEC-0059: botões "Remover" de #net-roots-list, mesmo tratamento que
  // #read-roots-list/#write-roots-list já recebem.
  const netRootsListButtons = [
    ...f.document.querySelectorAll('#net-roots-list button'),
  ] as unknown as DisableableElement[];
  return [...staticEls, ...personaListButtons, ...netRootsListButtons];
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

describe('serialização de gestos — painel de rede/busca (SPEC-0059)', () => {
  it('um host adicionado DURANTE um turno de chat em voo nasce com o botão "Remover" desabilitado (repintura depois de a serialização já ter começado)', async () => {
    let resolveSend: ((value: RendererTurnSnapshot) => void) | undefined;
    const sendPromise = new Promise<RendererTurnSnapshot>((resolve) => {
      resolveSend = resolve;
    });
    const f = await open({ chatSend: () => sendPromise });

    await submitChat(f, 'olá');
    expectAllDisabled(collectSerializedControls(f), true);

    (f.document.getElementById('net-root-input') as unknown as { value: string }).value =
      'exemplo.com';
    // `net-root-add` está `disabled` neste instante (turno em voo) — usa
    // `dispatchEvent` (não `.click()`, que o jsdom recusa em elemento
    // desabilitado) para provar que, mesmo que o clique alcance o
    // manipulador, o botão "Remover" recém-pintado NASCE desabilitado
    // (repaint depois de a serialização já ter começado).
    f.document
      .getElementById('net-root-add')
      ?.dispatchEvent(new f.window.Event('click', { bubbles: true, cancelable: true }));
    await f.flush();

    const netRootsButtons = [
      ...f.document.querySelectorAll('#net-roots-list button'),
    ] as unknown as DisableableElement[];
    expect(netRootsButtons.length).toBeGreaterThan(0);
    expectAllDisabled(netRootsButtons, true);

    resolveSend?.({ reply: 'oi', steps: [], learned: [] });
    await f.flush();

    expectAllDisabled(
      [...f.document.querySelectorAll('#net-roots-list button')] as unknown as DisableableElement[],
      false,
    );
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

    rejectAsk?.(new Error('falha no ask'));
    await f.flush();

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
  // Antes da SPEC-0049, `#ask-form` não tinha guarda alguma: um `ask`
  // disparado durante um turno de chat em voo chegava a chamar
  // `window.atlas.ask` e mantinha `askInFlight` verdadeiro mesmo depois de o
  // turno de chat assentar — o que este caso original provava era que o
  // `.finally` do turno de chat não reabria `#chat-send` sozinho nessa
  // situação (edição 2 da Frente 1 da SPEC-0048). A guarda "chat → ask"
  // desta SPEC (D2/CA10) torna esse cenário estruturalmente irreproduzível:
  // com `chatTurnInFlight` verdadeiro, o submit de `#ask-form` retorna sem
  // chamar `atlas.ask`, então `askInFlight` nunca chega a ficar verdadeiro
  // nesta ordem. O caso passa a provar exatamente isso — a tentativa de
  // `ask` concorrente é recusada e `#chat-send` reflete só o turno de chat.
  it('um ask disparado durante um turno de chat em voo não chega a chamar atlas.ask, e #chat-send reflete só o turno de chat', async () => {
    let askCalls = 0;
    let resolveSend: ((value: RendererTurnSnapshot) => void) | undefined;
    const sendPromise = new Promise<RendererTurnSnapshot>((resolve) => {
      resolveSend = resolve;
    });
    const f = await open({
      atlas: {
        ask: () => {
          askCalls += 1;
          return Promise.resolve({ text: 'pronto', steps: [], learned: [] });
        },
      },
      chatSend: () => sendPromise,
    });

    await submitChat(f, 'olá');
    submitAsk(f, 'faça algo');
    await f.flush();
    expect(askCalls).toBe(0);

    expect(
      (f.document.getElementById('chat-send') as unknown as { disabled: boolean }).disabled,
    ).toBe(true);

    resolveSend?.({ reply: 'oi', steps: [], learned: [] });
    await f.flush();

    expect(
      (f.document.getElementById('chat-send') as unknown as { disabled: boolean }).disabled,
    ).toBe(false);
  });
});

function disabledOf(f: RendererFixture, id: string): boolean {
  return (f.document.getElementById(id) as unknown as { disabled: boolean }).disabled;
}

function hiddenOf(f: RendererFixture, id: string): boolean {
  return (f.document.getElementById(id) as unknown as { hidden: boolean }).hidden;
}

describe('serialização de gestos — ask × ask (SPEC-0049)', () => {
  it('um 2º submit com um ask em voo não chama atlas.ask; ao assentar o 1º, o mesmo submit chama', async () => {
    let resolveAsk: ((value: RendererAskSnapshot) => void) | undefined;
    const askPromise = new Promise<RendererAskSnapshot>((resolve) => {
      resolveAsk = resolve;
    });
    let askCallCount = 0;
    const f = await open({
      atlas: {
        ask: () => {
          askCallCount += 1;
          return askPromise;
        },
      },
    });

    submitAsk(f, 'faça algo');
    expect(askCallCount).toBe(1);

    submitAsk(f, 'faça outra coisa');
    await f.flush();
    expect(askCallCount).toBe(1);

    resolveAsk?.({ text: 'pronto', steps: [], learned: [] });
    await f.flush();

    submitAsk(f, 'faça mais uma');
    await f.flush();
    expect(askCallCount).toBe(2);
  });

  it('#ask-submit fica desabilitado durante o ask em voo, e reabilitado ao assentar', async () => {
    let resolveAsk: ((value: RendererAskSnapshot) => void) | undefined;
    const askPromise = new Promise<RendererAskSnapshot>((resolve) => {
      resolveAsk = resolve;
    });
    const f = await open({ atlas: { ask: () => askPromise } });

    submitAsk(f, 'faça algo');
    expect(disabledOf(f, 'ask-submit')).toBe(true);

    resolveAsk?.({ text: 'pronto', steps: [], learned: [] });
    await f.flush();

    expect(disabledOf(f, 'ask-submit')).toBe(false);
  });
});

describe('serialização de gestos — chat → ask (SPEC-0049)', () => {
  it('#ask-submit desabilitado durante turno de chat; submeter não chama atlas.ask; ao assentar, chama', async () => {
    let resolveSend: ((value: RendererTurnSnapshot) => void) | undefined;
    const sendPromise = new Promise<RendererTurnSnapshot>((resolve) => {
      resolveSend = resolve;
    });
    let askCallCount = 0;
    const f = await open({
      chatSend: () => sendPromise,
      atlas: {
        ask: () => {
          askCallCount += 1;
          return Promise.resolve({ text: 'pronto', steps: [], learned: [] });
        },
      },
    });

    await submitChat(f, 'olá');
    expect(disabledOf(f, 'ask-submit')).toBe(true);

    submitAsk(f, 'faça algo');
    await f.flush();
    expect(askCallCount).toBe(0);

    resolveSend?.({ reply: 'oi', steps: [], learned: [] });
    await f.flush();

    expect(disabledOf(f, 'ask-submit')).toBe(false);

    submitAsk(f, 'faça algo');
    await f.flush();
    expect(askCallCount).toBe(1);
  });
});

describe('serialização de gestos — #objective fora da serialização (D3, SPEC-0049)', () => {
  it('#objective segue habilitado durante um turno de chat', async () => {
    let resolveSend: ((value: RendererTurnSnapshot) => void) | undefined;
    const sendPromise = new Promise<RendererTurnSnapshot>((resolve) => {
      resolveSend = resolve;
    });
    const f = await open({ chatSend: () => sendPromise });

    await submitChat(f, 'olá');
    expect(disabledOf(f, 'objective')).toBe(false);

    resolveSend?.({ reply: 'oi', steps: [], learned: [] });
    await f.flush();
  });

  it('#objective segue habilitado durante um ask em voo — decisão, não gap', async () => {
    let resolveAsk: ((value: RendererAskSnapshot) => void) | undefined;
    const askPromise = new Promise<RendererAskSnapshot>((resolve) => {
      resolveAsk = resolve;
    });
    const f = await open({ atlas: { ask: () => askPromise } });

    submitAsk(f, 'faça algo');
    expect(disabledOf(f, 'objective')).toBe(false);

    resolveAsk?.({ text: 'pronto', steps: [], learned: [] });
    await f.flush();
  });
});

// SPEC-0051: gesto de escape — #ask-cancel/#chat-cancel, CA 20-22. O
// clique só chama `window.atlas.cancel()` (nunca escreve texto nem mexe em
// askInFlight/chatTurnInFlight diretamente); o aviso de transparência é
// escrito pelo `.catch` já existente do gesto correspondente.
describe('gesto de escape — visibilidade dos botões de cancelamento (CA20)', () => {
  it('#ask-cancel começa hidden/disabled e fica visível/habilitado sse askInFlight, voltando a hidden ao assentar', async () => {
    let resolveAsk: ((value: RendererAskSnapshot) => void) | undefined;
    const askPromise = new Promise<RendererAskSnapshot>((resolve) => {
      resolveAsk = resolve;
    });
    const f = await open({ atlas: { ask: () => askPromise } });

    expect(hiddenOf(f, 'ask-cancel')).toBe(true);
    expect(disabledOf(f, 'ask-cancel')).toBe(true);

    submitAsk(f, 'faça algo');
    expect(hiddenOf(f, 'ask-cancel')).toBe(false);
    expect(disabledOf(f, 'ask-cancel')).toBe(false);

    resolveAsk?.({ text: 'pronto', steps: [], learned: [] });
    await f.flush();

    expect(hiddenOf(f, 'ask-cancel')).toBe(true);
    expect(disabledOf(f, 'ask-cancel')).toBe(true);
  });

  it('#chat-cancel começa hidden/disabled e fica visível/habilitado sse chatTurnInFlight, voltando a hidden ao assentar', async () => {
    let resolveSend: ((value: RendererTurnSnapshot) => void) | undefined;
    const sendPromise = new Promise<RendererTurnSnapshot>((resolve) => {
      resolveSend = resolve;
    });
    const f = await open({ chatSend: () => sendPromise });

    expect(hiddenOf(f, 'chat-cancel')).toBe(true);
    expect(disabledOf(f, 'chat-cancel')).toBe(true);

    await submitChat(f, 'olá');
    expect(hiddenOf(f, 'chat-cancel')).toBe(false);
    expect(disabledOf(f, 'chat-cancel')).toBe(false);

    resolveSend?.({ reply: 'oi', steps: [], learned: [] });
    await f.flush();

    expect(hiddenOf(f, 'chat-cancel')).toBe(true);
    expect(disabledOf(f, 'chat-cancel')).toBe(true);
  });

  it('com window.atlas.cancel() devolvendo {cancelled:false}, nenhum aviso é escrito e nenhum estado de botão muda (CA22)', async () => {
    let resolveSend: ((value: RendererTurnSnapshot) => void) | undefined;
    const sendPromise = new Promise<RendererTurnSnapshot>((resolve) => {
      resolveSend = resolve;
    });
    const f = await open({
      chatSend: () => sendPromise,
      cancelOutcome: { cancelled: false },
    });

    await submitChat(f, 'olá');
    f.document
      .getElementById('chat-cancel')
      ?.dispatchEvent(new f.window.Event('click', { bubbles: true, cancelable: true }));
    await f.flush();

    expect(f.calls.cancelCalls).toBe(1);
    expect(disabledOf(f, 'chat-send')).toBe(true);
    expect(hiddenOf(f, 'chat-cancel')).toBe(false);

    resolveSend?.({ reply: 'oi', steps: [], learned: [] });
    await f.flush();

    const transcript = f.document.getElementById('chat-transcript')?.textContent ?? '';
    expect(transcript).not.toContain('⏳ Cancelado');
  });
});

describe('gesto de escape — clique aciona window.atlas.cancel() e o aviso de transparência (CA21)', () => {
  const CANCEL_NOTICE =
    '⏳ Cancelado: o trabalho já iniciado continua encerrando em segundo plano — ' +
    'ações de arquivo já autorizadas ainda podem concluir; até ele assentar, esta ' +
    'conversa não aceita turnos novos e os painéis de configuração podem recusar.';

  it('#chat-cancel: chama cancel() uma vez; ao a promessa do turno rejeitar, o transcript recebe ⚠️ seguido do aviso, uma única vez', async () => {
    let rejectSend: ((error: Error) => void) | undefined;
    const sendPromise = new Promise<RendererTurnSnapshot>((_resolve, reject) => {
      rejectSend = reject;
    });
    const f = await open({
      chatSend: () => sendPromise,
      cancelOutcome: { cancelled: true },
    });

    await submitChat(f, 'olá');
    f.document
      .getElementById('chat-cancel')
      ?.dispatchEvent(new f.window.Event('click', { bubbles: true, cancelable: true }));
    await f.flush();

    expect(f.calls.cancelCalls).toBe(1);

    rejectSend?.(new Error('Turno cancelado pelo usuário.'));
    await f.flush();

    const transcript = f.document.getElementById('chat-transcript')?.textContent ?? '';
    expect(transcript).toContain('⚠️ Turno cancelado pelo usuário.');
    expect(transcript).toContain(CANCEL_NOTICE);

    // Uma rejeição NÃO-cancelada seguinte não repete o aviso.
    let rejectSecond: ((error: Error) => void) | undefined;
    const secondSendPromise = new Promise<RendererTurnSnapshot>((_resolve, reject) => {
      rejectSecond = reject;
    });
    const f2 = await open({ chatSend: () => secondSendPromise });
    await submitChat(f2, 'de novo');
    rejectSecond?.(new Error('falha qualquer'));
    await f2.flush();
    const secondTranscript = f2.document.getElementById('chat-transcript')?.textContent ?? '';
    expect(secondTranscript).not.toContain('⏳ Cancelado');
  });

  it('#ask-cancel: chama cancel() uma vez; ao a promessa do ask rejeitar, #ask-result recebe ⚠️ seguido do aviso, uma única vez', async () => {
    let rejectAsk: ((error: Error) => void) | undefined;
    const askPromise = new Promise<RendererAskSnapshot>((_resolve, reject) => {
      rejectAsk = reject;
    });
    const f = await open({
      atlas: { ask: () => askPromise },
      cancelOutcome: { cancelled: true },
    });

    submitAsk(f, 'faça algo');
    f.document
      .getElementById('ask-cancel')
      ?.dispatchEvent(new f.window.Event('click', { bubbles: true, cancelable: true }));
    await f.flush();

    expect(f.calls.cancelCalls).toBe(1);

    rejectAsk?.(new Error('Pergunta cancelada pelo usuário.'));
    await f.flush();

    const result = f.document.getElementById('ask-result')?.textContent ?? '';
    expect(result).toContain('⚠️ Pergunta cancelada pelo usuário.');
    expect(result).toContain(CANCEL_NOTICE);
  });
});
