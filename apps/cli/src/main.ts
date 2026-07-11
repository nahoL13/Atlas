#!/usr/bin/env -S npx tsx
import { readFileSync } from 'node:fs';
import { createCliInputGateway } from './gateway/input-gateway.js';
import { createConsoleOutputGateway } from './gateway/output-gateway.js';
import { run } from './run.js';

function readVersion(): string {
  const pkgUrl = new URL('../package.json', import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgUrl, 'utf8')) as { version: string };
  return pkg.version;
}

const gateways = {
  input: createCliInputGateway(),
  output: createConsoleOutputGateway(),
};

const code = await run(process.argv.slice(2), process.env, gateways, readVersion());
process.exit(code);
