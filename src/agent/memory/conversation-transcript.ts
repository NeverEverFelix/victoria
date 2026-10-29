import { createHash } from "node:crypto";
import type { ConversationMessage } from "./types.js";

/** Convert old transcript rows using a stable content-derived identity. */
export function conversationMessagesFromLegacy(
  conversationId: string,
  messages: readonly string[]
): readonly ConversationMessage[] {
  return Object.freeze(messages.map((value, index) => {
    const assistant = /^Victoria:\s*/i.exec(value);
    const user = /^User:\s*/i.exec(value);
    const role = assistant ? "assistant" : "user";
    const content = assistant ? value.slice(assistant[0].length) : user ? value.slice(user[0].length) : value;
    const digest = createHash("sha256").update(conversationId).update("\0").update(String(index))
      .update("\0").update(role).update("\0").update(content).digest("hex").slice(0, 20);
    return Object.freeze({
      schemaVersion: 1 as const, id: `legacy_${digest}`, conversationId, role, content, status: "completed" as const
    });
  }));
}

export function legacyConversationContext(messages: readonly ConversationMessage[]): readonly string[] {
  return Object.freeze(messages.map((message) => {
    if (message.role === "assistant") return `Victoria: ${message.content}`;
    if (message.role === "tool") return `Tool: ${message.content}`;
    // Escape role-looking user text so legacy consumers cannot mistake it for assistant prose.
    return /^(?:Victoria|User|Tool):\s*/i.test(message.content)
      ? `User: ${message.content}` : message.content;
  }));
}

export function isConversationMessage(value: unknown): value is ConversationMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.schemaVersion === 1 && typeof candidate.id === "string" && candidate.id.trim().length > 0 &&
    typeof candidate.conversationId === "string" && candidate.conversationId.trim().length > 0 &&
    (candidate.role === "user" || candidate.role === "assistant" || candidate.role === "tool") &&
    typeof candidate.content === "string" &&
    (candidate.createdAt === undefined || (typeof candidate.createdAt === "string" && Number.isFinite(Date.parse(candidate.createdAt)))) &&
    (candidate.toolCallId === undefined || typeof candidate.toolCallId === "string") &&
    (candidate.status === undefined || ["received", "completed", "failed"].includes(String(candidate.status)));
}
