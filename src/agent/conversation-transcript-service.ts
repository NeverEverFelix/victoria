import { randomUUID } from "node:crypto";
import { DEFAULT_CONVERSATION_CONTEXT_LIMIT, type ConversationMessage, type MemoryProvider } from "./memory/types.js";
import { conversationMessagesFromLegacy, legacyConversationContext } from "./memory/conversation-transcript.js";

export interface LoadedConversationTranscript {
  readonly typedMessages?: readonly ConversationMessage[];
  readonly context: readonly string[];
}

/** Owns typed/legacy transcript conversion, turn deduplication, and persistence. */
export class ConversationTranscriptService {
  constructor(private readonly memory: MemoryProvider) {}

  async load(userId: string, conversationId: string): Promise<LoadedConversationTranscript> {
    const typedMessages = this.memory.getConversationMessages
      ? await this.memory.getConversationMessages(userId, conversationId)
      : undefined;
    const context = typedMessages
      ? legacyConversationContext(typedMessages)
      : await this.memory.getConversationContext(userId, conversationId);
    return Object.freeze({ ...(typedMessages ? { typedMessages } : {}), context });
  }

  appendUserTurn(input: {
    readonly conversationId: string;
    readonly message: string;
    readonly sourceTurnReferences?: readonly { readonly turnId: string; readonly userMessage: string }[];
    readonly loaded: LoadedConversationTranscript;
  }): readonly ConversationMessage[] {
    const userMessage: ConversationMessage = Object.freeze({
      schemaVersion: 1,
      id: [...(input.sourceTurnReferences ?? [])].reverse().find((turn) => turn.userMessage === input.message)?.turnId ??
        `conversation-user-message_${randomUUID()}`,
      conversationId: input.conversationId,
      role: "user",
      content: input.message,
      createdAt: new Date().toISOString(),
      status: "completed"
    });
    const previousMessages = input.loaded.typedMessages ??
      conversationMessagesFromLegacy(input.conversationId, input.loaded.context);
    const alreadyStored = previousMessages.some((message) => message.id === userMessage.id);
    return Object.freeze([
      ...previousMessages,
      ...(alreadyStored ? [] : [userMessage])
    ].slice(-DEFAULT_CONVERSATION_CONTEXT_LIMIT));
  }

  appendAssistantTurn(input: {
    readonly conversationId: string;
    readonly messages: readonly ConversationMessage[];
    readonly response: string;
  }): readonly ConversationMessage[] {
    return Object.freeze([
      ...input.messages,
      Object.freeze({
        schemaVersion: 1 as const,
        id: `conversation-assistant-message_${randomUUID()}`,
        conversationId: input.conversationId,
        role: "assistant" as const,
        content: input.response,
        createdAt: new Date().toISOString(),
        status: "completed" as const
      })
    ].slice(-DEFAULT_CONVERSATION_CONTEXT_LIMIT));
  }

  async persist(userId: string, conversationId: string, messages: readonly ConversationMessage[]): Promise<void> {
    if (this.memory.setConversationMessages) {
      await this.memory.setConversationMessages(userId, conversationId, messages);
    } else {
      await this.memory.setConversationContext(userId, conversationId, legacyConversationContext(messages));
    }
  }
}
