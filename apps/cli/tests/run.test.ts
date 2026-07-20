import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

async function tmpMemoryPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'atlas-cli-mem-'));
  return join(dir, 'memory.json');
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

  it('remember grava um fato e memory list o mostra (persistido em disco)', async () => {
    const path = await tmpMemoryPath();
    const h1 = harness();
    const code1 = await run(
      ['remember', 'meu nome é Lohan', '--provider', 'fake', '--memory-path', path],
      {},
      h1.gateways,
      '0.1.0',
    );
    expect(code1).toBe(0);
    expect(h1.out()).toMatch(/^Lembrado \[[^\]]+\]: meu nome é Lohan\n$/);

    const h2 = harness();
    const code2 = await run(
      ['memory', 'list', '--provider', 'fake', '--memory-path', path],
      {},
      h2.gateways,
      '0.1.0',
    );
    expect(code2).toBe(0);
    expect(h2.out()).toContain('meu nome é Lohan');
  });

  it('remember de um fato duplicado (SPEC-0022) informa "Já conhecido" e não grava de novo', async () => {
    const path = await tmpMemoryPath();
    const h1 = harness();
    const code1 = await run(
      ['remember', 'meu nome é Lohan', '--provider', 'fake', '--memory-path', path],
      {},
      h1.gateways,
      '0.1.0',
    );
    expect(code1).toBe(0);
    expect(h1.out()).toMatch(/^Lembrado \[[^\]]+\]: meu nome é Lohan\n$/);

    const h2 = harness();
    const code2 = await run(
      ['remember', '  MEU NOME É LOHAN  ', '--provider', 'fake', '--memory-path', path],
      {},
      h2.gateways,
      '0.1.0',
    );
    expect(code2).toBe(0);
    expect(h2.out()).toContain('Já conhecido');

    const h3 = harness();
    const code3 = await run(
      ['memory', 'list', '--provider', 'fake', '--memory-path', path],
      {},
      h3.gateways,
      '0.1.0',
    );
    expect(code3).toBe(0);
    expect(h3.out().match(/meu nome é Lohan/g)).toHaveLength(1);
  });

  it('forget remove um fato previamente lembrado', async () => {
    const path = await tmpMemoryPath();
    const h1 = harness();
    await run(
      ['remember', 'fato temporário', '--provider', 'fake', '--memory-path', path],
      {},
      h1.gateways,
      '0.1.0',
    );
    const id = h1.out().match(/^Lembrado \[([^\]]+)\]:/)![1]!;

    const h2 = harness();
    const code = await run(
      ['forget', id, '--provider', 'fake', '--memory-path', path],
      {},
      h2.gateways,
      '0.1.0',
    );
    expect(code).toBe(0);
    expect(h2.out()).toContain(`Esquecido [${id}]`);

    const h3 = harness();
    await run(
      ['memory', 'list', '--provider', 'fake', '--memory-path', path],
      {},
      h3.gateways,
      '0.1.0',
    );
    expect(h3.out()).toContain('Nenhum fato memorizado');
  });

  it('chat: um plano com delete_file pausa e pergunta inline; aprovado remove o arquivo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'atlas-cli-chat-confirm-'));
    const target = join(dir, 'apagar.txt');
    await writeFile(target, 'conteúdo');
    const plan = JSON.stringify({ steps: [{ tool: 'delete_file', args: { path: target } }] });

    const h = harness();
    const code = await run(
      ['chat', '--provider', 'fake', '--allow-write', dir],
      {},
      h.gateways,
      '0.1.0',
      { createLineReader: () => scriptedReader([plan, 's', '/sair']) },
    );

    expect(code).toBe(0);
    expect(h.out()).toContain('🔧 delete_file → removido:');
    await expect(readFile(target)).rejects.toThrow();
  });

  it('chat: recusado no confirm inline mantém o arquivo e a conversa continua', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'atlas-cli-chat-confirm-'));
    const target = join(dir, 'mantido.txt');
    await writeFile(target, 'conteúdo');
    const plan = JSON.stringify({ steps: [{ tool: 'delete_file', args: { path: target } }] });

    const h = harness();
    const code = await run(
      ['chat', '--provider', 'fake', '--allow-write', dir],
      {},
      h.gateways,
      '0.1.0',
      { createLineReader: () => scriptedReader([plan, 'n', 'oi de novo', '/sair']) },
    );

    expect(code).toBe(0);
    expect(h.out()).toContain('🔧 delete_file → erro: ação cancelada pelo usuário');
    await expect(readFile(target, 'utf8')).resolves.toBe('conteúdo');
    // a conversa continua no próximo turno (fake ecoa o próximo input)
    expect(h.out()).toContain('[fake] oi de novo');
  });

  it('memory list vazio informa que não há fatos', async () => {
    const path = await tmpMemoryPath();
    const h = harness();
    const code = await run(
      ['memory', 'list', '--provider', 'fake', '--memory-path', path],
      {},
      h.gateways,
      '0.1.0',
    );
    expect(code).toBe(0);
    expect(h.out()).toContain('Nenhum fato memorizado');
  });

  it('remember sem fato retorna 2 e escreve o uso em stderr', async () => {
    const h = harness();
    const code = await run(['remember'], {}, h.gateways, '0.1.0');
    expect(code).toBe(2);
    expect(h.err()).toContain('fato');
  });

  it('forget de id inexistente informa e retorna 0', async () => {
    const path = await tmpMemoryPath();
    const h = harness();
    const code = await run(
      ['forget', 'zzzzzzzz', '--provider', 'fake', '--memory-path', path],
      {},
      h.gateways,
      '0.1.0',
    );
    expect(code).toBe(0);
    expect(h.out()).toContain('Nenhum fato com id zzzzzzzz');
  });
});
