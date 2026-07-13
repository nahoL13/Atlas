import { createInterface, type Interface } from 'node:readline';

export interface LineReader {
  next(prompt: string): Promise<string | null>;
  close(): void;
}

export function createReadlineLineReader(): LineReader {
  const rl: Interface = createInterface({ input: process.stdin, output: process.stdout });

  // Fila de linhas lidas mas ainda não consumidas (input em rajada, ex.: pipe)
  // e fila de chamadas next() aguardando a próxima linha. Só uma delas tem
  // itens a qualquer momento.
  const pending: string[] = [];
  const waiters: Array<(line: string | null) => void> = [];
  let closed = false;

  rl.on('line', (line) => {
    const waiter = waiters.shift();
    if (waiter !== undefined) {
      waiter(line);
    } else {
      pending.push(line);
    }
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length > 0) {
      const waiter = waiters.shift();
      if (waiter !== undefined) {
        waiter(null);
      }
    }
  });
  // Ctrl-C encerra de forma limpa (dispara 'close').
  rl.on('SIGINT', () => {
    rl.close();
  });

  return {
    next(prompt: string): Promise<string | null> {
      const buffered = pending.shift();
      if (buffered !== undefined) {
        return Promise.resolve(buffered);
      }
      if (closed) {
        return Promise.resolve(null);
      }
      process.stdout.write(prompt);
      return new Promise((resolve) => {
        waiters.push(resolve);
      });
    },
    close(): void {
      rl.close();
    },
  };
}
