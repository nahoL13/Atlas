import { describe, expect, it } from 'vitest';
import type { AtlasPlatform } from '@atlas/contracts';
import { runStatus } from '../src/commands/status.js';
import type { OutputGateway } from '../src/gateway/output-gateway.js';

function capture() {
  const out: string[] = [];
  const gateway: OutputGateway = {
    write: (text) => {
      out.push(text);
    },
    error: () => {},
  };
  return { gateway, text: () => out.join('') };
}

describe('runStatus', () => {
  it('renderiza estado e config resolvida', () => {
    const atlas: AtlasPlatform = {
      state: 'ready',
      config: {
        logLevel: 'info',
        dataDir: '/home/x/.atlas',
        model: { provider: 'local', model: 'llama3.2' },
      },
      cognitive: {
        ask: async () => '',
        startConversation: () => ({ messages: [] }),
        respond: async () => ({ reply: '', conversation: { messages: [] } }),
      },
      shutdown: async () => {},
    };
    const cap = capture();
    runStatus(atlas, cap.gateway);
    const text = cap.text();
    expect(text).toContain('Atlas: ready');
    expect(text).toContain('logLevel: info');
    expect(text).toContain('dataDir: /home/x/.atlas');
  });
});
