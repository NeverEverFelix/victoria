import type { AgentMemory, ClassifiedMessage } from "../types.js";
import type { VictoriaConversationContext } from "../conversation-context-builder.js";

export interface LlmAdapter {
  classifyMessage(input: ClassifyMessageInput): Promise<ClassifiedMessage>;
  draftResponse(input: DraftResponseInput): Promise<string>;
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
