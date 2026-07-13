import type { Message } from './model.js';

export interface Conversation {
  readonly messages: readonly Message[];
}

export interface ConversationTurn {
  readonly reply: string;
  readonly conversation: Conversation;
}

export interface CognitiveCore {
  ask(objective: string): Promise<string>;
  startConversation(): Conversation;
  respond(conversation: Conversation, input: string): Promise<ConversationTurn>;
}
