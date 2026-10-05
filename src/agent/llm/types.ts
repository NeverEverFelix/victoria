import type { AgentMemory, ClassifiedMessage } from "../types.js";

export interface LlmAdapter {
  classifyMessage(input: ClassifyMessageInput): Promise<ClassifiedMessage>;
  draftResponse(input: DraftResponseInput): Promise<string>;
}

export interface ClassifyMessageInput {
  userMessage: string;
  memory: AgentMemory;
  conversationContext?: readonly string[];
}

export interface DraftResponseInput {
  userMessage: string;
  memory: AgentMemory;
  classification: ClassifiedMessage;
  responseGoal: string;
}
