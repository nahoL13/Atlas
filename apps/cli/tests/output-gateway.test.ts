import { describe, expect, it } from 'vitest';
import { createConsoleOutputGateway } from '../src/gateway/output-gateway.js';

function fakeStream() {
  const chunks: string[] = [];
  return {
    chunks,
    text: () => chunks.join(''),
    write: (text: string) => {
      chunks.push(text);
      return true;
    },
  };
}

describe('ConsoleOutputGateway', () => {
  it('write envia o texto exato ao stdout e nada ao stderr', () => {
    const out = fakeStream();
    const err = fakeStream();
    const gw = createConsoleOutputGateway({ stdout: out, stderr: err });
    gw.write('olá\n');
    expect(out.text()).toBe('olá\n');
    expect(err.text()).toBe('');
  });

  it('error envia o texto exato ao stderr e nada ao stdout', () => {
    const out = fakeStream();
    const err = fakeStream();
    const gw = createConsoleOutputGateway({ stdout: out, stderr: err });
    gw.error('falha\n');
    expect(err.text()).toBe('falha\n');
    expect(out.text()).toBe('');
  });
});
