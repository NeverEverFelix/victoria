import type { AgentMemory, ClassifiedMessage } from "../types.js";

export interface LlmAdapter {
  classifyMessage(input: ClassifyMessageInput): Promise<ClassifiedMessage>;
  draftResponse(input: DraftResponseInput): Promise<string>;
}

export interface ClassifyMessageInput {
  userMessage: string;
  /** Adapters must abort provider work on timeout/cancellation and must not publish late output. */
  signal: AbortSignal;
}

export interface DraftResponseInput {
  userMessage: string;
  memory: AgentMemory;
  classification: ClassifiedMessage;
  responseGoal: string;
  signal: AbortSignal;
}
