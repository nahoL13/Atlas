export interface OutputGateway {
  write(text: string): void;
  error(text: string): void;
}

export interface Writable {
  write(text: string): unknown;
}

export interface OutputStreams {
  stdout: Writable;
  stderr: Writable;
}

export function createConsoleOutputGateway(
  streams: OutputStreams = { stdout: process.stdout, stderr: process.stderr },
): OutputGateway {
  return {
    write(text) {
      streams.stdout.write(text);
    },
    error(text) {
      streams.stderr.write(text);
    },
  };
}
