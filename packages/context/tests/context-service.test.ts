import { describe, expect, it } from 'vitest';
import type { Conversation } from '@atlas/contracts';
import { AtlasError } from '@atlas/contracts';
import { createContextService } from '../src/index.js';

function conv(content: string): Conversation {
  return { messages: [{ role: 'system', content }] };
}

describe('createContextService', () => {
  it('open→get devolve exatamente a conversa guardada', () => {
    const ctx = createContextService();
    const c = conv('inicial');
    const id = ctx.openSession(c);
    expect(ctx.getConversation(id)).toBe(c);
  });

  it('update substitui a conversa da sessão', () => {
    const ctx = createContextService();
    const id = ctx.openSession(conv('v1'));
    const v2 = conv('v2');
    ctx.updateConversation(id, v2);
    expect(ctx.getConversation(id)).toBe(v2);
  });

  it('sessões são isoladas entre si', () => {
    const ctx = createContextService();
    const a = ctx.openSession(conv('a'));
    const b = ctx.openSession(conv('b'));
    expect(a).not.toBe(b);
    expect(ctx.getConversation(a)).not.toBe(ctx.getConversation(b));
  });

  it('close remove a sessão', () => {
    const ctx = createContextService();
    const id = ctx.openSession(conv('x'));
    ctx.closeSession(id);
    expect(() => ctx.getConversation(id)).toThrow(AtlasError);
  });

  it('get/update/close em sessão inexistente lançam AtlasError com code ATLAS_CONTEXT', () => {
    const ctx = createContextService();
    const missing = 'nao-existe';
    const actions: Array<() => void> = [
      () => ctx.getConversation(missing),
      () => ctx.updateConversation(missing, conv('y')),
      () => ctx.closeSession(missing),
    ];
    for (const act of actions) {
      try {
        act();
        throw new Error('deveria ter lançado');
      } catch (e) {
        expect(e).toBeInstanceOf(AtlasError);
        expect((e as AtlasError).code).toBe('ATLAS_CONTEXT');
      }
    }
  });
});
