import { describe, expect, it } from 'vitest';
import type { AtlasConfig, AtlasPlatform } from '@atlas/contracts';
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

function fakeAtlas(permissions: AtlasConfig['permissions']): AtlasPlatform {
  return {
    state: 'ready',
    config: {
      logLevel: 'info',
      dataDir: '/home/x/.atlas',
      persona: 'jarvis',
      memory: { path: '/home/x/.atlas/memory.json' },
      permissions,
      model: { provider: 'local', model: 'llama3.2' },
    },
    persona: {
      id: 'jarvis',
      name: 'Jarvis',
      tone: 'profissional',
      formality: 'informal-respeitoso',
      language: 'espelhe o idioma',
      style: 'objetivo',
      communicationRules: [],
      voice: '',
      emotion: '',
    },
    cognitive: {
      ask: async () => ({ text: '' }),
      startConversation: () => ({ messages: [] }),
      respond: async () => ({ reply: '', conversation: { messages: [] } }),
    },
    context: {
      openSession: () => 'session-1',
      getConversation: () => ({ messages: [] }),
      updateConversation: () => {},
      closeSession: () => {},
    },
    memory: {
      remember: async () => ({ id: 'x', text: '', createdAt: '' }),
      forget: async () => false,
      list: () => [],
      prompt: () => undefined,
    },
    shutdown: async () => {},
  };
}

describe('runStatus', () => {
  it('renderiza estado e config resolvida (readRoots + writeRoots)', () => {
    const cap = capture();
    runStatus(
      fakeAtlas({ readRoots: ['/home/x/project'], writeRoots: ['/home/x/out'] }),
      cap.gateway,
    );
    const text = cap.text();
    expect(text).toContain('Atlas: ready');
    expect(text).toContain('logLevel: info');
    expect(text).toContain('dataDir: /home/x/.atlas');
    expect(text).toContain('persona: Jarvis (jarvis)');
    expect(text).toContain('readRoots: /home/x/project');
    expect(text).toContain('writeRoots: /home/x/out');
  });

  it('exibe writeRoots como (nenhuma) quando vazio', () => {
    const cap = capture();
    runStatus(fakeAtlas({ readRoots: ['/home/x/project'], writeRoots: [] }), cap.gateway);
    expect(cap.text()).toContain('writeRoots: (nenhuma)');
  });
});
