import type { Conversation, ContextService, SessionId } from '@atlas/contracts';
import { ContextError } from './errors.js';

export function createContextService(): ContextService {
  const sessions = new Map<SessionId, Conversation>();

  function mustGet(id: SessionId): Conversation {
    const conversation = sessions.get(id);
    if (conversation === undefined) {
      throw new ContextError(`Sessão desconhecida: ${id}`);
    }
    return conversation;
  }

  return {
    openSession(conversation: Conversation): SessionId {
      const id = crypto.randomUUID();
      sessions.set(id, conversation);
      return id;
    },
    getConversation(id: SessionId): Conversation {
      return mustGet(id);
    },
    updateConversation(id: SessionId, conversation: Conversation): void {
      mustGet(id);
      sessions.set(id, conversation);
    },
    closeSession(id: SessionId): void {
      if (!sessions.delete(id)) {
        throw new ContextError(`Sessão desconhecida: ${id}`);
      }
    },
  };
}
