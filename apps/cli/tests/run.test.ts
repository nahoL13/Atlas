import { describe, expect, it } from 'vitest';
import { createCliInputGateway } from '../src/gateway/input-gateway.js';
import type { OutputGateway } from '../src/gateway/output-gateway.js';
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
});
