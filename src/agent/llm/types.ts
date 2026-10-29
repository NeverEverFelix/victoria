import type { AgentMemory, ClassifiedMessage } from "../types.js";
import type { VictoriaConversationContext } from "../conversation-context-builder.js";
import type { ConversationContextSnapshot } from "../conversation-responder.js";

export interface LlmAdapter {
  classifyMessage(input: ClassifyMessageInput): Promise<ClassifiedMessage>;
  draftResponse(input: DraftResponseInput): Promise<string>;
  /** Contextual interpretation only; output is untrusted and cannot authorize an action. */
  understandTurn?(input: { readonly contextSnapshot: ConversationContextSnapshot }): Promise<unknown>;
}

export interface ClassifyMessageInput {
  userMessage: string;
  memory: AgentMemory;
  conversationContext?: readonly string[];
  /** Curated read-only facts and workflow state; never an approval signal. */
  financialContext?: VictoriaConversationContext;
}

export interface DraftResponseInput {
  userMessage: string;
  memory: AgentMemory;
  classification: ClassifiedMessage;
  responseGoal: string;
}
