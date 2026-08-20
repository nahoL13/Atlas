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
      remember: async () => ({ fact: { id: 'x', text: '', createdAt: '' }, created: true }),
      forget: async () => false,
      list: () => [],
      prompt: () => undefined,
      dedupe: async () => ({ applied: false, groups: [] }),
      search: () => [],
    },
    skills: {
      register: () => {},
      get: () => undefined,
      deactivate: () => false,
      remove: () => false,
      list: () => [],
    },
    skillBuilder: {
      build: async () => ({ ok: false, issues: [] }),
    },
    shutdown: async () => {},
  };
}

describe('runStatus', () => {
  it('renderiza estado e config resolvida (readRoots + writeRoots + netRoots)', () => {
    const cap = capture();
    runStatus(
      fakeAtlas({
        readRoots: ['/home/x/project'],
        writeRoots: ['/home/x/out'],
        netRoots: ['example.com'],
      }),
      cap.gateway,
    );
    const text = cap.text();
    expect(text).toContain('Atlas: ready');
    expect(text).toContain('logLevel: info');
    expect(text).toContain('dataDir: /home/x/.atlas');
    expect(text).toContain('persona: Jarvis (jarvis)');
    expect(text).toContain('readRoots: /home/x/project');
    expect(text).toContain('writeRoots: /home/x/out');
    expect(text).toContain('netRoots: example.com');
  });

  it('exibe writeRoots como (nenhuma) quando vazio', () => {
    const cap = capture();
    runStatus(
      fakeAtlas({ readRoots: ['/home/x/project'], writeRoots: [], netRoots: [] }),
      cap.gateway,
    );
    expect(cap.text()).toContain('writeRoots: (nenhuma)');
  });

  it('exibe netRoots como (nenhum) quando vazio', () => {
    const cap = capture();
    runStatus(
      fakeAtlas({ readRoots: ['/home/x/project'], writeRoots: [], netRoots: [] }),
      cap.gateway,
    );
    expect(cap.text()).toContain('netRoots: (nenhum)');
  });

  it('exibe múltiplos netRoots separados por vírgula', () => {
    const cap = capture();
    runStatus(
      fakeAtlas({ readRoots: ['/x'], writeRoots: [], netRoots: ['a.com', 'b.com'] }),
      cap.gateway,
    );
    expect(cap.text()).toContain('netRoots: a.com, b.com');
  });
});
