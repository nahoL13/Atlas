import { describe, expect, it } from 'vitest';
import { createLineReaderConfirmPort } from '../src/gateway/confirm-port.js';
import type { LineReader } from '../src/gateway/line-reader.js';

function scriptedReader(lines: (string | null)[]): { reader: LineReader; prompts: string[] } {
  let i = 0;
  const prompts: string[] = [];
  return {
    reader: {
      next: async (prompt: string) => {
        prompts.push(prompt);
        const line = lines[i++];
        return line === undefined ? null : line;
      },
      close: () => {},
    },
    prompts,
  };
}

describe('createLineReaderConfirmPort', () => {
  it('resolve true para "s"/"sim" (case-insensitive)', async () => {
    const { reader } = scriptedReader(['s']);
    const port = createLineReaderConfirmPort(reader);
    await expect(
      port.request({ resource: { type: 'file', path: '/tmp/a.txt' }, access: 'delete' }),
    ).resolves.toBe(true);

    const { reader: reader2 } = scriptedReader(['SIM']);
    const port2 = createLineReaderConfirmPort(reader2);
    await expect(
      port2.request({ resource: { type: 'file', path: '/tmp/a.txt' }, access: 'delete' }),
    ).resolves.toBe(true);
  });

  it('resolve false para qualquer outra resposta', async () => {
    const { reader } = scriptedReader(['n']);
    const port = createLineReaderConfirmPort(reader);
    await expect(
      port.request({ resource: { type: 'file', path: '/tmp/a.txt' }, access: 'delete' }),
    ).resolves.toBe(false);
  });

  it('resolve false quando o LineReader chega em EOF (linha null), nunca trava', async () => {
    const { reader } = scriptedReader([]);
    const port = createLineReaderConfirmPort(reader);
    await expect(
      port.request({ resource: { type: 'file', path: '/tmp/a.txt' }, access: 'delete' }),
    ).resolves.toBe(false);
  });

  it('usa lineReader.next (mesma fila do chat), sem instanciar um segundo readline', async () => {
    const { reader, prompts } = scriptedReader(['s']);
    const port = createLineReaderConfirmPort(reader);
    await port.request({ resource: { type: 'file', path: '/tmp/a.txt' }, access: 'delete' });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('delete');
    expect(prompts[0]).toContain('/tmp/a.txt');
  });
});
