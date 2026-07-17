import type { Message } from './model.js';
import type { ExecutedStep } from './execution.js';

export interface Conversation {
  readonly messages: readonly Message[];
}

export interface ConversationTurn {
  readonly reply: string;
  readonly conversation: Conversation;
  readonly steps?: readonly ExecutedStep[];
}

export interface AskResult {
  readonly text: string;
  readonly steps?: readonly ExecutedStep[];
}

export interface CognitiveCore {
  ask(objective: string): Promise<AskResult>;
  startConversation(): Conversation;
  respond(conversation: Conversation, input: string): Promise<ConversationTurn>;
}
