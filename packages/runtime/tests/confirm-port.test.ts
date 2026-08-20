import { Readable, Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { ActionRequest } from '@atlas/contracts';
import { nodeReadlineConfirmPort } from '../src/index.js';

function fakeTtyInput(): Readable {
  const stream = new Readable({ read() {} }) as Readable & { isTTY?: boolean };
  stream.isTTY = true;
  return stream;
}

function sink(chunks?: string[]): Writable {
  return new Writable({
    write(chunk, _encoding, callback) {
      chunks?.push(String(chunk));
      callback();
    },
  });
}

const action: ActionRequest = { resource: { type: 'file', path: '/out/a.txt' }, access: 'delete' };

describe('nodeReadlineConfirmPort', () => {
  it('recusa automaticamente quando o input não é TTY (não trava)', async () => {
    const input = new Readable({ read() {} });
    const port = nodeReadlineConfirmPort(input, sink());
    await expect(port.request(action)).resolves.toBe(false);
  });

  it('recusa automaticamente quando o input fecha (EOF) antes de responder', async () => {
    const input = fakeTtyInput();
    const port = nodeReadlineConfirmPort(input, sink());
    const pending = port.request(action);
    input.push(null);
    await expect(pending).resolves.toBe(false);
  });

  it('aprova quando a resposta é "s"', async () => {
    const input = fakeTtyInput();
    const port = nodeReadlineConfirmPort(input, sink());
    const pending = port.request(action);
    input.push('s\n');
    await expect(pending).resolves.toBe(true);
  });

  it('recusa quando a resposta não é afirmativa', async () => {
    const input = fakeTtyInput();
    const port = nodeReadlineConfirmPort(input, sink());
    const pending = port.request(action);
    input.push('n\n');
    await expect(pending).resolves.toBe(false);
  });

  it('narrowing de ResourceRef (D16, SPEC-0055): recurso de rede usa host, não path, na pergunta', async () => {
    const netAction: ActionRequest = {
      resource: { type: 'network', host: 'example.com' },
      access: 'read',
    };
    const written: string[] = [];
    const input = fakeTtyInput();
    const port = nodeReadlineConfirmPort(input, sink(written));
    const pending = port.request(netAction);
    input.push('s\n');
    await pending;
    expect(written.join('')).toContain('example.com');
  });
});
