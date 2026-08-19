import type { Message, TokenUsage } from './model.js';
import type { ExecutedStep } from './execution.js';

export interface Conversation {
  readonly messages: readonly Message[];
}

export interface ConversationTurn {
  readonly reply: string;
  readonly conversation: Conversation;
  readonly steps?: readonly ExecutedStep[];
  readonly learned?: readonly string[];
  /** Soma do consumo de tokens de todas as `generate` do turno (SPEC-0054). */
  readonly usage?: TokenUsage;
}

export interface AskResult {
  readonly text: string;
  readonly steps?: readonly ExecutedStep[];
  readonly learned?: readonly string[];
  /** Soma do consumo de tokens de todas as `generate` do turno (SPEC-0054). */
  readonly usage?: TokenUsage;
}

export interface CognitiveCore {
  ask(objective: string): Promise<AskResult>;
  startConversation(): Conversation;
  respond(conversation: Conversation, input: string): Promise<ConversationTurn>;
}
