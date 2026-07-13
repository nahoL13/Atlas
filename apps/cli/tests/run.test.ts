import { describe, expect, it } from 'vitest';
import { createCliInputGateway } from '../src/gateway/input-gateway.js';
import type { OutputGateway } from '../src/gateway/output-gateway.js';
import type { LineReader } from '../src/gateway/line-reader.js';
import { run } from '../src/run.js';

function harness() {
  const out: string[] = [];
  const err: string[] = [];
  const output: OutputGateway = {
    write: (text) => {
      out.push(text);
    },
    error: (text) => {
      err.push(text);
    },
  };
  return {
    gateways: { input: createCliInputGateway(), output },
    out: () => out.join(''),
    err: () => err.join(''),
  };
}

function scriptedReader(lines: string[]): LineReader {
  let i = 0;
  return {
    next: async () => (i < lines.length ? lines[i++]! : null),
    close: () => {},
  };
}

describe('run (integração apps → core)', () => {
  it('status sobe o core, imprime ready e retorna 0', async () => {
    const h = harness();
    const code = await run(['status'], {}, h.gateways, '0.1.0');
    expect(code).toBe(0);
    expect(h.out()).toContain('Atlas: ready');
    expect(h.out()).toContain('logLevel: info');
  });

  it('a flag sobrepõe o env na config resolvida', async () => {
    const h = harness();
    const code = await run(
      ['status', '--log-level', 'debug'],
      { ATLAS_LOG_LEVEL: 'error' },
      h.gateways,
      '0.1.0',
    );
    expect(code).toBe(0);
    expect(h.out()).toContain('logLevel: debug');
  });

  it('log-level inválido retorna 1 e escreve em stderr', async () => {
    const h = harness();
    const code = await run(['status', '--log-level', 'bogus'], {}, h.gateways, '0.1.0');
    expect(code).toBe(1);
    expect(h.err()).toContain('inválid');
    expect(h.out()).toBe('');
  });

  it('comando desconhecido retorna 2 e escreve o uso em stderr', async () => {
    const h = harness();
    const code = await run(['bogus'], {}, h.gateways, '0.1.0');
    expect(code).toBe(2);
    expect(h.err()).toContain('Usage:');
  });

  it('--version retorna 0 e imprime a versão injetada', async () => {
    const h = harness();
    const code = await run(['--version'], {}, h.gateways, '9.9.9');
    expect(code).toBe(0);
    expect(h.out()).toContain('9.9.9');
  });

  it('--help retorna 0 e imprime o uso', async () => {
    const h = harness();
    const code = await run(['--help'], {}, h.gateways, '0.1.0');
    expect(code).toBe(0);
    expect(h.out()).toContain('Usage:');
  });

  it('ask com provider fake imprime a resposta e retorna 0', async () => {
    const h = harness();
    const code = await run(['ask', 'olá', '--provider', 'fake'], {}, h.gateways, '0.1.0');
    expect(code).toBe(0);
    expect(h.out()).toContain('[fake] olá');
  });

  it('ask sem objetivo retorna 2 e escreve o uso em stderr', async () => {
    const h = harness();
    const code = await run(['ask'], {}, h.gateways, '0.1.0');
    expect(code).toBe(2);
    expect(h.err()).toContain('objetivo');
  });

  it('erro do modelo (provider local sem rede) retorna 1 com mensagem amigável', async () => {
    const h = harness();
    const failingFetch = (async () => {
      throw new Error('sem rede');
    }) as unknown as typeof fetch;
    const code = await run(
      ['ask', 'olá', '--provider', 'local', '--model', 'llama3.2'],
      {},
      h.gateways,
      '0.1.0',
      { fetch: failingFetch },
    );
    expect(code).toBe(1);
    expect(h.err()).toContain('modelo');
    expect(h.out()).toBe('');
  });

  it('erro de modelo no chat imprime mensagem amigável, mantém o loop e retorna 0', async () => {
    const h = harness();
    const failingFetch = (async () => {
      throw new Error('sem rede');
    }) as unknown as typeof fetch;
    const code = await run(
      ['chat', '--provider', 'local', '--model', 'llama3.2'],
      {},
      h.gateways,
      '0.1.0',
      { fetch: failingFetch, createLineReader: () => scriptedReader(['primeira', '/sair']) },
    );
    expect(code).toBe(0);
    expect(h.err()).toContain('modelo');
    expect(h.out()).toBe('Jarvis: olá! Como posso ajudar?\n');
  });

  it('chat com fake saúda como Jarvis e responde cada linha na ordem', async () => {
    const h = harness();
    const code = await run(['chat', '--provider', 'fake'], {}, h.gateways, '0.1.0', {
      createLineReader: () => scriptedReader(['oi', 'tudo bem?', '/sair']),
    });
    expect(code).toBe(0);
    expect(h.out()).toBe('Jarvis: olá! Como posso ajudar?\n[fake] oi\n[fake] tudo bem?\n');
  });

  it('chat encerra em EOF (linha null) com exit 0', async () => {
    const h = harness();
    const code = await run(['chat', '--provider', 'fake'], {}, h.gateways, '0.1.0', {
      createLineReader: () => scriptedReader(['olá']),
    });
    expect(code).toBe(0);
    expect(h.out()).toBe('Jarvis: olá! Como posso ajudar?\n[fake] olá\n');
  });

  it('status mostra a persona ativa (default jarvis)', async () => {
    const h = harness();
    const code = await run(['status'], {}, h.gateways, '0.1.0');
    expect(code).toBe(0);
    expect(h.out()).toContain('persona: Jarvis (jarvis)');
  });

  it('--persona seleciona a persona (neutral) e sobrepõe o env', async () => {
    const h = harness();
    const code = await run(
      ['status', '--persona', 'neutral'],
      { ATLAS_PERSONA: 'jarvis' },
      h.gateways,
      '0.1.0',
    );
    expect(code).toBe(0);
    expect(h.out()).toContain('persona: Assistente (neutral)');
  });

  it('persona inválida retorna 1 com erro de config', async () => {
    const h = harness();
    const code = await run(['status', '--persona', 'batman'], {}, h.gateways, '0.1.0');
    expect(code).toBe(1);
    expect(h.err()).toContain('persona');
  });
});
