import { describe, expect, it, vi } from "vitest";
import { createConversationFinishHandler } from "../../../src/app/http/conversation-finish-handler.js";
import { createVictoriaSessionAuthenticator, signVictoriaSession } from "../../../src/app/http/signed-session-auth.js";

const secret = "test-only-session-secret-with-more-than-32-bytes";

describe("conversation finish HTTP boundary", () => {
  it("requires authentication and a valid conversation ID", async () => {
    const agent = { finishConversation: vi.fn(async () => true) };
    const handler = createConversationFinishHandler({ authenticate: createVictoriaSessionAuthenticator(secret), agent });

    const unauthorized = await handler(new Request("https://victoria.local/finish", { method: "POST" }), "chat-1");
    const invalidId = await handler(new Request("https://victoria.local/finish", {
      method: "POST", headers: { authorization: `Bearer ${signVictoriaSession({ userId: "user-a", secret })}` }
    }), "../other-user-chat");

    expect(unauthorized.status).toBe(401);
    expect(invalidId.status).toBe(400);
    expect(agent.finishConversation).not.toHaveBeenCalled();
  });

  it("finishes only the authenticated user's conversation and reports whether context was saved", async () => {
    const agent = { finishConversation: vi.fn(async () => true) };
    const handler = createConversationFinishHandler({ authenticate: createVictoriaSessionAuthenticator(secret), agent });
    const token = signVictoriaSession({ userId: "user-a", secret });
    const response = await handler(new Request("https://victoria.local/finish", {
      method: "POST", headers: { authorization: `Bearer ${token}` }
    }), "chat-1");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true });
    expect(agent.finishConversation).toHaveBeenCalledWith("user-a", "chat-1");
  });
});
