import { describe, expect, it } from 'vitest';
import type { AtlasPlatform, Conversation, ConversationTurn } from '@atlas/contracts';
import { runChat } from '../src/commands/chat.js';
import type { OutputGateway } from '../src/gateway/output-gateway.js';
import type { LineReader } from '../src/gateway/line-reader.js';

function capture(): { output: OutputGateway; text: () => string } {
  const lines: string[] = [];
  return {
    output: { write: (t) => lines.push(t), error: () => {} },
    text: () => lines.join(''),
  };
}

function scriptedReader(lines: string[]): LineReader {
  let i = 0;
  return {
    next: async () => (i < lines.length ? lines[i++]! : null),
    close: () => {},
  };
}

function stubAtlas(
  respond: (conversation: Conversation, input: string) => Promise<ConversationTurn>,
  remember?: (text: string, source?: 'user' | 'learned') => Promise<unknown>,
) {
  const store = new Map<string, Conversation>();
  return {
    persona: { id: 'jarvis', name: 'Jarvis' },
    cognitive: {
      ask: async () => ({ text: '' }),
      startConversation: () => ({ messages: [] }) as Conversation,
      respond,
    },
    memory: {
      remember:
        remember ??
        (async (text: string, source?: 'user' | 'learned') => ({
          id: 'x',
          text,
          createdAt: '',
          source,
        })),
    },
    context: {
      openSession: (conv: Conversation) => {
        const id = `session-${store.size}`;
        store.set(id, conv);
        return id;
      },
      getConversation: (id: string) => store.get(id)!,
      updateConversation: (id: string, next: Conversation) => {
        store.set(id, next);
      },
      closeSession: (id: string) => {
        store.delete(id);
      },
    },
  } as unknown as AtlasPlatform;
}

describe('runChat — traço de steps (SPEC-0014)', () => {
  it('sem steps, imprime só a resposta', async () => {
    const cap = capture();
    const atlas = stubAtlas(async (conversation, input) => ({
      reply: `eco: ${input}`,
      conversation: { messages: [...conversation.messages] },
    }));

    await runChat(atlas, cap.output, scriptedReader(['oi', '/sair']));

    expect(cap.text()).toBe('Jarvis: olá! Como posso ajudar?\neco: oi\n');
  });

  it('com steps, imprime o traço compacto antes da resposta (formato do ask)', async () => {
    const cap = capture();
    const atlas = stubAtlas(async (conversation, input) => ({
      reply: `feito: ${input}`,
      conversation: { messages: [...conversation.messages] },
      steps: [
        { tool: 'read_file', args: { path: 'a.txt' }, result: { ok: true, output: 'conteúdo' } },
        {
          tool: 'delete_file',
          args: { path: 'b.txt' },
          result: { ok: false, error: 'ação cancelada pelo usuário' },
        },
      ],
    }));

    await runChat(atlas, cap.output, scriptedReader(['apague b.txt', '/sair']));

    expect(cap.text()).toBe(
      'Jarvis: olá! Como posso ajudar?\n' +
        '🔧 read_file → conteúdo\n' +
        '🔧 delete_file → erro: ação cancelada pelo usuário\n' +
        '\n' +
        'feito: apague b.txt\n',
    );
  });

  it('a mensagem system de resumo (na Conversation) nunca é exibida ao usuário', async () => {
    const cap = capture();
    const atlas = stubAtlas(async (conversation, input) => ({
      reply: `feito: ${input}`,
      conversation: {
        messages: [
          ...conversation.messages,
          { role: 'user', content: input },
          { role: 'assistant', content: `feito: ${input}` },
          { role: 'system', content: '[Tools executadas: clock({}) → ok]' },
        ],
      },
      steps: [{ tool: 'clock', args: {}, result: { ok: true, output: '2026-07-17' } }],
    }));

    await runChat(atlas, cap.output, scriptedReader(['que horas são?', '/sair']));

    expect(cap.text()).not.toContain('Tools executadas');
  });

  it('com learned por turno, grava via memory.remember(.., "learned") e imprime o traço (SPEC-0020)', async () => {
    const cap = capture();
    const remembered: [string, 'user' | 'learned' | undefined][] = [];
    const atlas = stubAtlas(
      async (conversation, input) => ({
        reply: `eco: ${input}`,
        conversation: { messages: [...conversation.messages] },
        learned: ['mora em São Paulo'],
      }),
      async (text, source) => {
        remembered.push([text, source]);
        return { id: 'x', text, createdAt: '', source };
      },
    );

    await runChat(atlas, cap.output, scriptedReader(['moro em São Paulo', '/sair']));

    expect(remembered).toEqual([['mora em São Paulo', 'learned']]);
    expect(cap.text()).toBe(
      'Jarvis: olá! Como posso ajudar?\neco: moro em São Paulo\n💡 lembrado: mora em São Paulo\n',
    );
  });

  it('sem learned, nada é gravado nem impresso além do fluxo atual', async () => {
    const cap = capture();
    let rememberCalls = 0;
    const atlas = stubAtlas(
      async (conversation, input) => ({
        reply: `eco: ${input}`,
        conversation: { messages: [...conversation.messages] },
      }),
      async () => {
        rememberCalls += 1;
        return { id: 'x', text: '', createdAt: '' };
      },
    );

    await runChat(atlas, cap.output, scriptedReader(['oi', '/sair']));

    expect(rememberCalls).toBe(0);
    expect(cap.text()).toBe('Jarvis: olá! Como posso ajudar?\neco: oi\n');
  });
});
