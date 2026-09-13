import { describe, expect, it } from 'vitest';
import type { AtlasConfig, AtlasPlatform } from '@atlas/contracts';
import type { DependencyReport } from '@atlas/core';
import { runStatus } from '../src/commands/status.js';
import type { OutputGateway } from '../src/gateway/output-gateway.js';

const DISABLED_REPORT: DependencyReport = {
  outcomes: [
    { dependency: 'ollama', status: 'disabled' },
    { dependency: 'search-container', status: 'disabled' },
  ],
};
const ALREADY_RUNNING_REPORT: DependencyReport = {
  outcomes: [
    { dependency: 'ollama', status: 'already-running' },
    { dependency: 'search-container', status: 'disabled' },
  ],
};
const STARTED_REPORT: DependencyReport = {
  outcomes: [
    { dependency: 'ollama', status: 'started' },
    { dependency: 'search-container', status: 'disabled' },
  ],
};
const FAILED_TIMEOUT_REPORT: DependencyReport = {
  outcomes: [
    { dependency: 'ollama', status: 'failed', reason: 'timeout' },
    { dependency: 'search-container', status: 'disabled' },
  ],
};
const CONTAINER_ALREADY_RUNNING_REPORT: DependencyReport = {
  outcomes: [
    { dependency: 'ollama', status: 'disabled' },
    { dependency: 'search-container', status: 'already-running', container: 'searxng' },
  ],
};
const CONTAINER_STARTED_REPORT: DependencyReport = {
  outcomes: [
    { dependency: 'ollama', status: 'disabled' },
    { dependency: 'search-container', status: 'started', container: 'searxng' },
  ],
};
const CONTAINER_FAILED_REPORT: DependencyReport = {
  outcomes: [
    { dependency: 'ollama', status: 'disabled' },
    {
      dependency: 'search-container',
      status: 'failed',
      reason: 'container-unknown',
      container: 'searxng',
    },
  ],
};

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

function fakeAtlas(permissions: AtlasConfig['permissions'], searchUrl: string = ''): AtlasPlatform {
  return {
    state: 'ready',
    config: {
      logLevel: 'info',
      dataDir: '/home/x/.atlas',
      persona: 'jarvis',
      memory: { path: '/home/x/.atlas/memory.json' },
      permissions,
      model: { provider: 'local', model: 'llama3.2' },
      tools: { searchUrl },
      dependencies: { autoStartOllama: false, autoStartSearchContainer: '' },
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
      DISABLED_REPORT,
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
      DISABLED_REPORT,
    );
    expect(cap.text()).toContain('writeRoots: (nenhuma)');
  });

  it('exibe netRoots como (nenhum) quando vazio', () => {
    const cap = capture();
    runStatus(
      fakeAtlas({ readRoots: ['/home/x/project'], writeRoots: [], netRoots: [] }),
      cap.gateway,
      DISABLED_REPORT,
    );
    expect(cap.text()).toContain('netRoots: (nenhum)');
  });

  it('exibe múltiplos netRoots separados por vírgula', () => {
    const cap = capture();
    runStatus(
      fakeAtlas({ readRoots: ['/x'], writeRoots: [], netRoots: ['a.com', 'b.com'] }),
      cap.gateway,
      DISABLED_REPORT,
    );
    expect(cap.text()).toContain('netRoots: a.com, b.com');
  });

  it('exibe search: (não configurado) quando tools.searchUrl é vazio', () => {
    const cap = capture();
    runStatus(
      fakeAtlas({ readRoots: ['/x'], writeRoots: [], netRoots: [] }, ''),
      cap.gateway,
      DISABLED_REPORT,
    );
    expect(cap.text()).toContain('search: (não configurado)');
  });

  it('exibe search: <url> quando tools.searchUrl está configurado', () => {
    const cap = capture();
    runStatus(
      fakeAtlas({ readRoots: ['/x'], writeRoots: [], netRoots: [] }, 'https://h/search'),
      cap.gateway,
      DISABLED_REPORT,
    );
    expect(cap.text()).toContain('search: https://h/search');
  });

  // SPEC-0060/D14 (CA 20): quatro textos exaustivos, um por DependencyOutcome.
  describe('linha ollama auto-start', () => {
    const permissions: AtlasConfig['permissions'] = {
      readRoots: ['/x'],
      writeRoots: [],
      netRoots: [],
    };

    it('"disabled" ⇒ "ollama auto-start: desligado"', () => {
      const cap = capture();
      runStatus(fakeAtlas(permissions), cap.gateway, DISABLED_REPORT);
      expect(cap.text()).toContain('ollama auto-start: desligado');
    });

    it('"already-running" ⇒ "ollama auto-start: ligado (já em execução)"', () => {
      const cap = capture();
      runStatus(fakeAtlas(permissions), cap.gateway, ALREADY_RUNNING_REPORT);
      expect(cap.text()).toContain('ollama auto-start: ligado (já em execução)');
    });

    it('"started" ⇒ "ollama auto-start: ligado (iniciado pelo Atlas)"', () => {
      const cap = capture();
      runStatus(fakeAtlas(permissions), cap.gateway, STARTED_REPORT);
      expect(cap.text()).toContain('ollama auto-start: ligado (iniciado pelo Atlas)');
    });

    it('"failed"/"timeout" ⇒ "ollama auto-start: ligado (falhou: timeout)"', () => {
      const cap = capture();
      runStatus(fakeAtlas(permissions), cap.gateway, FAILED_TIMEOUT_REPORT);
      expect(cap.text()).toContain('ollama auto-start: ligado (falhou: timeout)');
    });
  });

  // SPEC-0061/D13: quatro textos exaustivos, seleção por `dependency` (não
  // mais `outcomes[0]`); a linha do Ollama continua correta mesmo com dois
  // outcomes no relatório (CA 29).
  describe('linha search container auto-start', () => {
    const permissions: AtlasConfig['permissions'] = {
      readRoots: ['/x'],
      writeRoots: [],
      netRoots: [],
    };

    it('"disabled" ⇒ "search container auto-start: desligado"', () => {
      const cap = capture();
      runStatus(fakeAtlas(permissions), cap.gateway, DISABLED_REPORT);
      expect(cap.text()).toContain('search container auto-start: desligado');
    });

    it('"already-running" ⇒ nome + "(já em execução)"', () => {
      const cap = capture();
      runStatus(fakeAtlas(permissions), cap.gateway, CONTAINER_ALREADY_RUNNING_REPORT);
      expect(cap.text()).toContain('search container auto-start: "searxng" (já em execução)');
    });

    it('"started" ⇒ nome + "(iniciado pelo Atlas)"', () => {
      const cap = capture();
      runStatus(fakeAtlas(permissions), cap.gateway, CONTAINER_STARTED_REPORT);
      expect(cap.text()).toContain('search container auto-start: "searxng" (iniciado pelo Atlas)');
    });

    it('"failed" ⇒ nome + "(falhou: <reason>)"', () => {
      const cap = capture();
      runStatus(fakeAtlas(permissions), cap.gateway, CONTAINER_FAILED_REPORT);
      expect(cap.text()).toContain(
        'search container auto-start: "searxng" (falhou: container-unknown)',
      );
    });

    it('a linha do Ollama continua correta mesmo com o relatório carregando dois outcomes', () => {
      const cap = capture();
      runStatus(fakeAtlas(permissions), cap.gateway, CONTAINER_STARTED_REPORT);
      expect(cap.text()).toContain('ollama auto-start: desligado');
    });
  });
});
