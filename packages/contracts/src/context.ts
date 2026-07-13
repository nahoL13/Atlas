import type { Conversation } from './cognitive.js';

export type SessionId = string;

export interface ContextService {
  openSession(conversation: Conversation): SessionId;
  getConversation(id: SessionId): Conversation;
  updateConversation(id: SessionId, conversation: Conversation): void;
  closeSession(id: SessionId): void;
}
