import { afterEach, describe, expect, it } from 'vitest';
import type {
  RendererDependencyOutcome,
  RendererDependencyStatusSnapshot,
  RendererFixture,
  RendererFixtureOptions,
  RendererSystemMetricsSnapshot,
  RendererTokenUsageSnapshot,
} from './helpers/renderer-harness.js';
import { loadRenderer } from './helpers/renderer-harness.js';

// SPEC-0054 — painel `Sistema`: ciclo de atualização (timer único, guarda de
// reentrância, descarte pós-fechamento, cinco gatilhos de cancelamento) e
// formatação pinada (Escopo 10), sobre o harness jsdom com relógio
// injetável. Zero réplica em TypeScript a comparar (Escopo 11) — cobertura
// inteiramente comportamental (DOM + canais IPC dublados).

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

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function text(f: RendererFixture, id: string): string {
  return f.document.getElementById(id)?.textContent ?? '';
}

function systemNavControl(f: RendererFixture): HTMLButtonElement {
  const control = [...f.document.querySelectorAll('#drawer-navigation [data-drawer-nav]')].find(
    (element) => element.getAttribute('aria-controls') === 'panel-system',
  );
  if (control === undefined) {
    throw new Error('controle de navegação do painel Sistema não encontrado');
  }
  return control as HTMLButtonElement;
}

async function openSystemPanel(f: RendererFixture): Promise<void> {
  (f.document.getElementById('menu-toggle') as HTMLButtonElement).click();
  systemNavControl(f).click();
  await f.flush();
}

const ALL_UNSUPPORTED: RendererSystemMetricsSnapshot = {
  cpu: { available: false, reason: 'unsupported' },
  memory: { available: false, reason: 'unsupported' },
  gpu: { available: false, reason: 'unsupported' },
  network: { available: false, reason: 'unsupported' },
};

const ZERO_TOKENS: RendererTokenUsageSnapshot = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  reportedTurns: 0,
  unreportedTurns: 0,
};

describe('abrir o painel Sistema — leitura imediata e timer único (CA24)', () => {
  it('leitura imediata de cada canal e relógio atualizado antes do 1º tick', async () => {
    const f = await open({ metricsSnapshot: ALL_UNSUPPORTED, tokensSnapshot: ZERO_TOKENS });
    await openSystemPanel(f);

    expect(f.calls.metricsReadCalls).toBe(1);
    expect(f.calls.tokensReadCalls).toBe(1);
    expect(text(f, 'system-clock-time')).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(text(f, 'system-clock-date')).toMatch(
      /^(domingo|segunda-feira|terça-feira|quarta-feira|quinta-feira|sexta-feira|sábado), \d{2}\/\d{2}\/\d{4}$/,
    );
    expect(text(f, 'system-status')).toBe(`Atualizado às ${text(f, 'system-clock-time')}`);
  });

  it('antes da 1ª leitura assentar, #system-status mostra "Lendo…"', async () => {
    const gate = deferred<RendererSystemMetricsSnapshot>();
    const f = await open({
      atlas: { metrics: { read: () => gate.promise } },
      tokensSnapshot: ZERO_TOKENS,
    });
    await openSystemPanel(f);
    expect(text(f, 'system-status')).toBe('Lendo…');
    gate.resolve(ALL_UNSUPPORTED);
    await f.flush();
    expect(text(f, 'system-status')).toMatch(/^Atualizado às/);
  });
});

describe('cadência do timer — 1s só relógio, 2s leitura (CA24/CA25)', () => {
  it('1000ms atualiza só o relógio; 2000ms dispara exatamente uma leitura de cada canal', async () => {
    const f = await open({ metricsSnapshot: ALL_UNSUPPORTED, tokensSnapshot: ZERO_TOKENS });
    await openSystemPanel(f);
    expect(f.calls.metricsReadCalls).toBe(1);
    const timeBefore = text(f, 'system-clock-time');

    f.clock.advance(1000);
    await f.flush();
    expect(f.calls.metricsReadCalls).toBe(1);
    expect(f.calls.tokensReadCalls).toBe(1);
    expect(text(f, 'system-clock-time')).not.toBe(timeBefore);

    f.clock.advance(1000); // completa 2000ms
    await f.flush();
    expect(f.calls.metricsReadCalls).toBe(2);
    expect(f.calls.tokensReadCalls).toBe(2);

    f.clock.advance(1000); // 3000ms — só relógio de novo
    await f.flush();
    expect(f.calls.metricsReadCalls).toBe(2);

    f.clock.advance(1000); // 4000ms — nova leitura
    await f.flush();
    expect(f.calls.metricsReadCalls).toBe(3);
    expect(f.calls.tokensReadCalls).toBe(3);
  });

  it('sem reentrância: leitura ainda em voo faz o tick de leitura seguinte ser pulado', async () => {
    let metricsCalls = 0;
    const gate = deferred<RendererSystemMetricsSnapshot>();
    const f = await open({
      atlas: {
        metrics: {
          read: () => {
            metricsCalls += 1;
            return gate.promise;
          },
        },
      },
      tokensSnapshot: ZERO_TOKENS,
    });
    await openSystemPanel(f);
    expect(metricsCalls).toBe(1);

    f.clock.advance(2000); // dispararia uma nova leitura, mas a 1ª ainda está em voo
    await f.flush();
    expect(metricsCalls).toBe(1);

    gate.resolve(ALL_UNSUPPORTED);
    await f.flush();

    f.clock.advance(2000); // agora a leitura anterior já assentou
    await f.flush();
    expect(metricsCalls).toBe(2);
  });
});

describe('cinco gatilhos de cancelamento do timer (CA24)', () => {
  it('fechar o próprio painel (clicar de novo) cancela o timer', async () => {
    const f = await open({ metricsSnapshot: ALL_UNSUPPORTED, tokensSnapshot: ZERO_TOKENS });
    await openSystemPanel(f);
    systemNavControl(f).click(); // fecha
    f.clock.advance(4000);
    await f.flush();
    expect(f.calls.metricsReadCalls).toBe(1); // nenhuma leitura nova
  });

  it('trocar de painel cancela o timer do Sistema', async () => {
    const f = await open({ metricsSnapshot: ALL_UNSUPPORTED, tokensSnapshot: ZERO_TOKENS });
    await openSystemPanel(f);
    const controls = [...f.document.querySelectorAll('#drawer-navigation [data-drawer-nav]')];
    (controls[0] as HTMLButtonElement).click(); // Persona
    f.clock.advance(4000);
    await f.flush();
    expect(f.calls.metricsReadCalls).toBe(1);
  });

  it('fechar o drawer pelo botão "Fechar" cancela o timer', async () => {
    const f = await open({ metricsSnapshot: ALL_UNSUPPORTED, tokensSnapshot: ZERO_TOKENS });
    await openSystemPanel(f);
    (f.document.getElementById('drawer-close') as HTMLButtonElement).click();
    f.clock.advance(4000);
    await f.flush();
    expect(f.calls.metricsReadCalls).toBe(1);
  });

  it('Escape cancela o timer', async () => {
    const f = await open({ metricsSnapshot: ALL_UNSUPPORTED, tokensSnapshot: ZERO_TOKENS });
    await openSystemPanel(f);
    f.document.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape' }));
    f.clock.advance(4000);
    await f.flush();
    expect(f.calls.metricsReadCalls).toBe(1);
  });

  it('clicar no backdrop cancela o timer', async () => {
    const f = await open({ metricsSnapshot: ALL_UNSUPPORTED, tokensSnapshot: ZERO_TOKENS });
    await openSystemPanel(f);
    (f.document.getElementById('drawer-backdrop') as HTMLElement).click();
    f.clock.advance(4000);
    await f.flush();
    expect(f.calls.metricsReadCalls).toBe(1);
  });

  it('o teardown da página ("beforeunload") cancela o timer', async () => {
    const f = await open({ metricsSnapshot: ALL_UNSUPPORTED, tokensSnapshot: ZERO_TOKENS });
    await openSystemPanel(f);
    f.window.dispatchEvent(new f.window.Event('beforeunload'));
    f.clock.advance(4000);
    await f.flush();
    expect(f.calls.metricsReadCalls).toBe(1);
  });

  it('nenhum timer desta fatia existe com o painel fechado (nunca abriu)', async () => {
    const f = await open({ metricsSnapshot: ALL_UNSUPPORTED, tokensSnapshot: ZERO_TOKENS });
    f.clock.advance(10_000);
    await f.flush();
    expect(f.calls.metricsReadCalls).toBe(0);
    expect(f.calls.tokensReadCalls).toBe(0);
  });
});

describe('descarte pós-fechamento (CA26)', () => {
  it('resposta que chega depois de o painel fechar não escreve no DOM', async () => {
    const metricsGate = deferred<RendererSystemMetricsSnapshot>();
    const tokensGate = deferred<RendererTokenUsageSnapshot>();
    const f = await open({
      atlas: {
        metrics: { read: () => metricsGate.promise },
        tokens: { read: () => tokensGate.promise },
      },
    });
    await openSystemPanel(f);
    expect(text(f, 'system-cpu')).toBe('');

    systemNavControl(f).click(); // fecha o painel ANTES de a leitura assentar

    metricsGate.resolve(ALL_UNSUPPORTED);
    tokensGate.resolve(ZERO_TOKENS);
    await f.flush();

    expect(text(f, 'system-cpu')).toBe('');
    expect(text(f, 'system-memory')).toBe('');
    // "Lendo…" foi escrito de forma SÍNCRONA na abertura, antes do fechamento
    // — não é a resposta descartada; só a resposta tardia (que mudaria para
    // "Atualizado às…") é que nunca chega a ser escrita.
    expect(text(f, 'system-status')).toBe('Lendo…');
  });
});

describe('rejeição de qualquer um dos dois canais (CA27)', () => {
  it('mostra os textos pinados nas quatro células e nos tokens, sem tocar #global-alert/#presence-core', async () => {
    const f = await open({
      atlas: { metrics: { read: () => Promise.reject(new Error('boom')) } },
      tokensSnapshot: ZERO_TOKENS,
    });
    await openSystemPanel(f);

    expect(text(f, 'system-cpu')).toBe('CPU: Indisponível: falha de leitura');
    expect(text(f, 'system-memory')).toBe('Memória: Indisponível: falha de leitura');
    expect(text(f, 'system-gpu')).toBe('GPU: Indisponível: falha de leitura');
    expect(text(f, 'system-network')).toBe('Rede: Indisponível: falha de leitura');
    expect(text(f, 'system-tokens')).toBe('Tokens desta sessão: Indisponível: falha de leitura');
    expect(text(f, 'system-status')).toBe('Falha ao ler as métricas do sistema.');

    expect((f.document.getElementById('global-alert') as HTMLElement).hidden).toBe(true);
    expect((f.document.getElementById('presence-core') as HTMLElement).dataset.state).not.toBe(
      'error',
    );
  });

  it('o painel segue utilizável: um novo tick de leitura tenta de novo', async () => {
    let attempt = 0;
    const f = await open({
      atlas: {
        metrics: {
          read: () => {
            attempt += 1;
            return attempt === 1
              ? Promise.reject(new Error('boom'))
              : Promise.resolve(ALL_UNSUPPORTED);
          },
        },
      },
      tokensSnapshot: ZERO_TOKENS,
    });
    await openSystemPanel(f);
    expect(text(f, 'system-status')).toBe('Falha ao ler as métricas do sistema.');

    f.clock.advance(2000);
    await f.flush();
    expect(text(f, 'system-status')).toMatch(/^Atualizado às/);
    expect(text(f, 'system-cpu')).toBe('CPU: Indisponível nesta plataforma');
  });
});

describe('formatação pinada (Escopo 10/CA28)', () => {
  it.each([
    {
      name: '0% e 100% (CPU/GPU)',
      metrics: {
        cpu: { available: true, value: { loadPercent: 0 } },
        memory: ALL_UNSUPPORTED.memory,
        gpu: { available: true, value: { loadPercent: 100 } },
        network: ALL_UNSUPPORTED.network,
      } as RendererSystemMetricsSnapshot,
      tokens: ZERO_TOKENS,
      expected: {
        'system-cpu': 'CPU: 0,0 %',
        'system-gpu': 'GPU: 100,0 %',
      },
    },
    {
      name: 'arredondamento de meia casa (57,75 → 57,8)',
      metrics: {
        ...ALL_UNSUPPORTED,
        memory: {
          available: true,
          value: { usedBytes: 9_240_000_000, totalBytes: 16_000_000_000, usedPercent: 57.75 },
        },
      } as RendererSystemMetricsSnapshot,
      tokens: ZERO_TOKENS,
      expected: {
        'system-memory': 'Memória: 9,2 GB de 16,0 GB (57,8 %)',
      },
    },
    {
      name: 'bytes em B/kB/MB/GB — exemplo literal do Escopo 10 (rede)',
      metrics: {
        ...ALL_UNSUPPORTED,
        network: {
          available: true,
          value: { rxBytesPerSecond: 1_234_000, txBytesPerSecond: 340_000 },
        },
      } as RendererSystemMetricsSnapshot,
      tokens: ZERO_TOKENS,
      expected: {
        'system-network': 'Rede: recebendo 1,2 MB/s · enviando 340,0 kB/s',
      },
    },
    {
      name: 'bytes em B puro (sem casa decimal)',
      metrics: {
        ...ALL_UNSUPPORTED,
        network: { available: true, value: { rxBytesPerSecond: 500, txBytesPerSecond: 0 } },
      } as RendererSystemMetricsSnapshot,
      tokens: ZERO_TOKENS,
      expected: {
        'system-network': 'Rede: recebendo 500 B/s · enviando 0 B/s',
      },
    },
    {
      name: 'memória em GB, percentual redondo',
      metrics: {
        ...ALL_UNSUPPORTED,
        memory: {
          available: true,
          value: { usedBytes: 8_000_000_000, totalBytes: 16_000_000_000, usedPercent: 50 },
        },
      } as RendererSystemMetricsSnapshot,
      tokens: ZERO_TOKENS,
      expected: {
        'system-memory': 'Memória: 8,0 GB de 16,0 GB (50,0 %)',
      },
    },
    {
      name: 'os três textos de indisponibilidade, um por reason',
      metrics: {
        cpu: { available: false, reason: 'unsupported' },
        memory: { available: true, value: { usedBytes: 1, totalBytes: 2, usedPercent: 50 } },
        gpu: { available: false, reason: 'read-failed' },
        network: { available: false, reason: 'timeout' },
      } as RendererSystemMetricsSnapshot,
      tokens: ZERO_TOKENS,
      expected: {
        'system-cpu': 'CPU: Indisponível nesta plataforma',
        'system-gpu': 'GPU: Indisponível: falha de leitura',
        'system-network': 'Rede: Indisponível: leitura expirou',
      },
    },
    {
      name: 'tokens: reportedTurns=0/unreportedTurns=0',
      metrics: ALL_UNSUPPORTED,
      tokens: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        reportedTurns: 0,
        unreportedTurns: 0,
      } as RendererTokenUsageSnapshot,
      expected: { 'system-tokens': 'Tokens desta sessão: 0' },
    },
    {
      name: 'tokens: reportedTurns=0/unreportedTurns>0',
      metrics: ALL_UNSUPPORTED,
      tokens: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        reportedTurns: 0,
        unreportedTurns: 3,
      } as RendererTokenUsageSnapshot,
      expected: {
        'system-tokens': 'Tokens desta sessão: indisponível (o provedor não reporta consumo)',
      },
    },
    {
      name: 'tokens: reportedTurns>0/unreportedTurns=0 — exemplo literal do Escopo 10, com milhar',
      metrics: ALL_UNSUPPORTED,
      tokens: {
        promptTokens: 800,
        completionTokens: 434,
        totalTokens: 1234,
        reportedTurns: 3,
        unreportedTurns: 0,
      } as RendererTokenUsageSnapshot,
      expected: { 'system-tokens': 'Tokens desta sessão: 1.234 (entrada 800 · saída 434)' },
    },
    {
      name: 'tokens: reportedTurns>0/unreportedTurns>0',
      metrics: ALL_UNSUPPORTED,
      tokens: {
        promptTokens: 800,
        completionTokens: 434,
        totalTokens: 1234,
        reportedTurns: 3,
        unreportedTurns: 2,
      } as RendererTokenUsageSnapshot,
      expected: {
        'system-tokens':
          'Tokens desta sessão: 1.234 (entrada 800 · saída 434) · 2 turno(s) sem relato',
      },
    },
  ])('$name', async ({ metrics, tokens, expected }) => {
    const f = await open({ metricsSnapshot: metrics, tokensSnapshot: tokens });
    await openSystemPanel(f);
    for (const [id, value] of Object.entries(expected)) {
      expect(text(f, id)).toBe(value);
    }
    const emojiPattern = /\p{Extended_Pictographic}/u;
    for (const id of [
      'system-clock-date',
      'system-clock-time',
      'system-cpu',
      'system-memory',
      'system-gpu',
      'system-network',
      'system-tokens',
      'system-status',
    ]) {
      expect(emojiPattern.test(text(f, id))).toBe(false);
    }
  });
});

describe('relógio — padding e virada de segundo/minuto sob relógio injetável (CA29)', () => {
  it('sempre exibe dois dígitos por campo, mesmo quando o valor é < 10', async () => {
    const f = await open({ metricsSnapshot: ALL_UNSUPPORTED, tokensSnapshot: ZERO_TOKENS });
    await openSystemPanel(f);
    expect(text(f, 'system-clock-time')).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(text(f, 'system-clock-date')).toMatch(/\d{2}\/\d{2}\/\d{4}$/);
  });

  it('o relógio avança a cada tick de 1s e a virada de minuto muda o campo MM', async () => {
    const f = await open({ metricsSnapshot: ALL_UNSUPPORTED, tokensSnapshot: ZERO_TOKENS });
    await openSystemPanel(f);
    const before = text(f, 'system-clock-time');
    const minuteBefore = before.split(':')[1];

    for (let i = 0; i < 61; i += 1) {
      f.clock.advance(1000);
    }
    await f.flush();

    const after = text(f, 'system-clock-time');
    expect(after).not.toBe(before);
    expect(after.split(':')[1]).not.toBe(minuteBefore);
  });

  it('a data muda quando o relógio avança mais de 24h (virada de dia)', async () => {
    const withoutJump = await open({
      metricsSnapshot: ALL_UNSUPPORTED,
      tokensSnapshot: ZERO_TOKENS,
    });
    await openSystemPanel(withoutJump);
    const dateWithoutJump = text(withoutJump, 'system-clock-date');
    withoutJump.close();
    fixture = undefined;

    // `reducedMotion: true` cancela o loop de `requestAnimationFrame` do
    // núcleo — sem isso, um avanço grande do relógio replayaria o loop
    // continuamente (mesma disciplina de todo teste desta suíte que usa
    // avanços pequenos; aqui, avançar ANTES de abrir o painel, com nenhum
    // timer desta fatia ainda vivo, é O(1) mesmo para um salto grande).
    const withJump = await open({ reducedMotion: true });
    withJump.clock.advance(25 * 60 * 60 * 1000); // 25h — cruza pelo menos uma virada de dia
    await openSystemPanel(withJump);
    const dateWithJump = text(withJump, 'system-clock-date');

    expect(dateWithJump).not.toBe(dateWithoutJump);
  });
});

describe('não entra na serialização de gestos (CA31)', () => {
  it('abrir o painel não desabilita #chat-send/#ask-submit nem #objective', async () => {
    const f = await open({ metricsSnapshot: ALL_UNSUPPORTED, tokensSnapshot: ZERO_TOKENS });
    await openSystemPanel(f);
    expect((f.document.getElementById('chat-send') as HTMLButtonElement).disabled).toBe(false);
    expect((f.document.getElementById('ask-submit') as HTMLButtonElement).disabled).toBe(false);
    expect((f.document.getElementById('objective') as HTMLInputElement).disabled).toBe(false);
  });

  it('funciona com um turno de chat em voo, e o turno completa normalmente com o painel aberto', async () => {
    const turnGate = deferred<{ reply: string; steps: []; learned: [] }>();
    const f = await open({
      metricsSnapshot: ALL_UNSUPPORTED,
      tokensSnapshot: ZERO_TOKENS,
      chatSend: () => turnGate.promise,
    });
    await openSystemPanel(f);

    const input = f.document.getElementById('chat-input') as HTMLInputElement;
    input.value = 'oi';
    f.document
      .getElementById('chat-form')
      ?.dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true }));
    await f.flush();

    // uma leitura periódica do painel ainda funciona com o turno em voo.
    f.clock.advance(2000);
    await f.flush();
    expect(f.calls.metricsReadCalls).toBeGreaterThan(1);

    turnGate.resolve({ reply: 'oi de volta', steps: [], learned: [] });
    await f.flush();

    expect(f.calls.chatSend).toHaveLength(1);
  });
});

// SPEC-0062 (CAs 39-41): o painel Sistema ganha uma 3ª leitura por tick
// (`dependencies.read()`), sobre a MESMA cadência/timer/reentrância/descarte
// já provados acima para metrics/tokens — nenhum timer novo, nenhuma mudança
// na cadência 1s/2s. `#system-dependencies` mostra uma linha por dependência
// desta sessão, com os textos exaustivos de D17 (nenhum `reason` cru).

const NO_DEPENDENCIES: RendererDependencyStatusSnapshot = {
  ollama: undefined,
  searchContainers: [],
};

// `Omit`/`Extract` sobre a união `RendererDependencyOutcome` colapsariam
// `reason`/`container` (interseção de chaves comuns, não união por membro)
// — por isso os dois formatos são declarados aqui, à mão, espelhando os
// quatro/quatro casos de `DependencyOutcome` (`@atlas/core`).
type OllamaOutcomeInput =
  | { readonly status: 'disabled' }
  | { readonly status: 'already-running' }
  | { readonly status: 'started' }
  | {
      readonly status: 'failed';
      readonly reason: 'binary-missing' | 'spawn-failed' | 'timeout';
    };

type ContainerOutcomeInput =
  | { readonly status: 'disabled' }
  | { readonly status: 'already-running'; readonly container: string }
  | { readonly status: 'started'; readonly container: string }
  | {
      readonly status: 'failed';
      readonly reason: 'docker-unavailable' | 'container-unknown' | 'start-failed' | 'timeout';
      readonly container: string;
    };

function ollamaOutcome(outcome: OllamaOutcomeInput): RendererDependencyOutcome {
  return { dependency: 'ollama', ...outcome } as RendererDependencyOutcome;
}

function containerOutcome(outcome: ContainerOutcomeInput): RendererDependencyOutcome {
  return { dependency: 'search-container', ...outcome } as RendererDependencyOutcome;
}

describe('dependências externas — 3º invoke no mesmo tick, sem timer novo (CA39)', () => {
  it('leitura imediata inclui dependencies.read(); o tick de 2000ms dispara os três invokes juntos', async () => {
    const f = await open({
      metricsSnapshot: ALL_UNSUPPORTED,
      tokensSnapshot: ZERO_TOKENS,
      dependenciesStatus: NO_DEPENDENCIES,
    });
    await openSystemPanel(f);
    expect(f.calls.metricsReadCalls).toBe(1);
    expect(f.calls.tokensReadCalls).toBe(1);
    expect(f.calls.dependenciesReadCalls).toBe(1);

    f.clock.advance(1000); // 1000ms — só relógio, nenhuma leitura nova
    await f.flush();
    expect(f.calls.dependenciesReadCalls).toBe(1);

    f.clock.advance(1000); // completa 2000ms — os três juntos, mesmo tick
    await f.flush();
    expect(f.calls.metricsReadCalls).toBe(2);
    expect(f.calls.tokensReadCalls).toBe(2);
    expect(f.calls.dependenciesReadCalls).toBe(2);
  });

  it('fechar o painel cancela o timer único; uma resposta de dependencies.read() que chega depois é descartada', async () => {
    const gate = deferred<RendererDependencyStatusSnapshot>();
    const f = await open({
      metricsSnapshot: ALL_UNSUPPORTED,
      tokensSnapshot: ZERO_TOKENS,
      atlas: { dependencies: { read: () => gate.promise } },
    });
    await openSystemPanel(f);
    expect(text(f, 'system-dependencies')).toBe('');

    systemNavControl(f).click(); // fecha o painel ANTES de a leitura assentar

    gate.resolve({
      ollama: ollamaOutcome({ status: 'started' }),
      searchContainers: [],
    });
    await f.flush();

    expect(text(f, 'system-dependencies')).toBe('');
  });
});

describe('#system-dependencies — linhas exaustivas por dependência (CA40)', () => {
  it('mostra o texto de "ainda verificando" enquanto ollama é undefined, e a linha pinada de lista vazia', async () => {
    const f = await open({
      metricsSnapshot: ALL_UNSUPPORTED,
      tokensSnapshot: ZERO_TOKENS,
      dependenciesStatus: NO_DEPENDENCIES,
    });
    await openSystemPanel(f);

    expect(text(f, 'system-dependencies')).toContain('Ollama: ainda verificando');
    expect(text(f, 'system-dependencies')).toContain('Nenhum container de busca nesta sessão.');
  });

  it.each([
    [ollamaOutcome({ status: 'disabled' }), 'Ollama: auto-start desligado.'],
    [ollamaOutcome({ status: 'already-running' }), 'Ollama: já estava em execução.'],
    [ollamaOutcome({ status: 'started' }), 'Ollama: iniciado automaticamente pelo Atlas.'],
    [
      ollamaOutcome({ status: 'failed', reason: 'binary-missing' }),
      'Ollama: não foi possível iniciar (binário do Ollama não encontrado).',
    ],
    [
      ollamaOutcome({ status: 'failed', reason: 'spawn-failed' }),
      'Ollama: não foi possível iniciar (falha ao iniciar o processo do Ollama).',
    ],
    [
      ollamaOutcome({ status: 'failed', reason: 'timeout' }),
      'Ollama: não foi possível iniciar (tempo esgotado esperando o Ollama responder).',
    ],
  ])('desfecho de Ollama %j pinta "%s"', async (outcome, expected) => {
    const f = await open({
      metricsSnapshot: ALL_UNSUPPORTED,
      tokensSnapshot: ZERO_TOKENS,
      dependenciesStatus: { ollama: outcome, searchContainers: [] },
    });
    await openSystemPanel(f);

    expect(text(f, 'system-dependencies')).toContain(expected);
  });

  it.each([
    [
      containerOutcome({ status: 'already-running', container: 'searxng' }),
      'Container de busca "searxng": já estava em execução.',
    ],
    [
      containerOutcome({ status: 'started', container: 'searxng' }),
      'Container de busca "searxng": iniciado automaticamente pelo Atlas.',
    ],
    [
      containerOutcome({ status: 'failed', reason: 'docker-unavailable', container: 'searxng' }),
      'Container de busca "searxng": não foi possível iniciar (Docker indisponível).',
    ],
    [
      containerOutcome({ status: 'failed', reason: 'container-unknown', container: 'searxng' }),
      'Container de busca "searxng": não foi possível iniciar ' +
        '(o Atlas nunca cria containers — verifique o nome).',
    ],
    [
      containerOutcome({ status: 'failed', reason: 'start-failed', container: 'searxng' }),
      'Container de busca "searxng": não foi possível iniciar (falha ao iniciar o container).',
    ],
    [
      containerOutcome({ status: 'failed', reason: 'timeout', container: 'searxng' }),
      'Container de busca "searxng": não foi possível iniciar ' +
        '(tempo esgotado esperando o container ficar pronto).',
    ],
  ])('desfecho de container %j pinta "%s"', async (outcome, expected) => {
    const f = await open({
      metricsSnapshot: ALL_UNSUPPORTED,
      tokensSnapshot: ZERO_TOKENS,
      dependenciesStatus: { ollama: undefined, searchContainers: [outcome] },
    });
    await openSystemPanel(f);

    expect(text(f, 'system-dependencies')).toContain(expected);
  });

  it('duas entradas distintas de searchContainers produzem DUAS linhas (D22 — o painel não sub-reporta o que a sessão possui)', async () => {
    const f = await open({
      metricsSnapshot: ALL_UNSUPPORTED,
      tokensSnapshot: ZERO_TOKENS,
      dependenciesStatus: {
        ollama: ollamaOutcome({ status: 'already-running' }),
        searchContainers: [
          containerOutcome({ status: 'started', container: 'bootstrap' }),
          containerOutcome({ status: 'already-running', container: 'gesto' }),
        ],
      },
    });
    await openSystemPanel(f);

    const dependenciesText = text(f, 'system-dependencies');
    expect(dependenciesText).toContain(
      'Container de busca "bootstrap": iniciado automaticamente pelo Atlas.',
    );
    expect(dependenciesText).toContain('Container de busca "gesto": já estava em execução.');
    expect(f.document.querySelectorAll('#system-dependencies p')).toHaveLength(3); // Ollama + 2 containers
  });

  it('rejeição de dependencies.read() pinta o texto pinado de falha na célula e em #system-status, sem tocar #global-alert/#presence-core', async () => {
    const f = await open({
      metricsSnapshot: ALL_UNSUPPORTED,
      tokensSnapshot: ZERO_TOKENS,
      atlas: { dependencies: { read: () => Promise.reject(new Error('boom')) } },
    });
    await openSystemPanel(f);

    expect(text(f, 'system-dependencies')).toBe('Falha ao ler o estado das dependências externas.');
    expect(text(f, 'system-status')).toBe('Falha ao ler as métricas do sistema.');
    expect((f.document.getElementById('global-alert') as HTMLElement).hidden).toBe(true);
    expect((f.document.getElementById('presence-core') as HTMLElement).dataset.state).not.toBe(
      'error',
    );
  });
});

describe('#system-dependencies — nenhuma reason crua na interface (CA41)', () => {
  it('as sete reasons (três do Ollama, quatro do container) são todas traduzidas', async () => {
    const rawReasons = [
      'binary-missing',
      'spawn-failed',
      'timeout',
      'docker-unavailable',
      'container-unknown',
      'start-failed',
    ];
    const outcomes: RendererDependencyOutcome[] = [
      ollamaOutcome({ status: 'failed', reason: 'binary-missing' }),
      ollamaOutcome({ status: 'failed', reason: 'spawn-failed' }),
      ollamaOutcome({ status: 'failed', reason: 'timeout' }),
      containerOutcome({ status: 'failed', reason: 'docker-unavailable', container: 'a' }),
      containerOutcome({ status: 'failed', reason: 'container-unknown', container: 'a' }),
      containerOutcome({ status: 'failed', reason: 'start-failed', container: 'a' }),
      containerOutcome({ status: 'failed', reason: 'timeout', container: 'a' }),
    ];

    for (const outcome of outcomes) {
      const f = await open({
        metricsSnapshot: ALL_UNSUPPORTED,
        tokensSnapshot: ZERO_TOKENS,
        dependenciesStatus:
          outcome.dependency === 'ollama'
            ? { ollama: outcome, searchContainers: [] }
            : { ollama: undefined, searchContainers: [outcome] },
      });
      await openSystemPanel(f);

      const dependenciesText = text(f, 'system-dependencies');
      for (const raw of rawReasons) {
        expect(dependenciesText).not.toContain(raw);
      }
      f.close();
      fixture = undefined;
    }
  });
});
