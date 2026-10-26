import { describe, expect, it, vi } from "vitest";
import { MockLlmAdapter, MockMemoryProvider, MockVictoriaTools, VictoriaAgent } from "../../../src/agent/index.js";
import { OpenAiConversationResponder, validateConversationReply } from "../../../src/agent/conversation-responder.js";

describe("conversation response boundary", () => {
  it("supplies only scoped historical event context to a read-only conversation response", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const responder = new OpenAiConversationResponder({
      apiKey: "test-key", model: "test-model", fetcher: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ output: [{ type: "message", content: [{
          type: "output_text", text: JSON.stringify({ text: "You first mentioned skipping the purchase." })
        }] }] }), { status: 200 });
      }
    });
    const events = [{
      eventId: "event-1", type: "avoided_spend" as const, summary: "I skipped a $35 purchase.",
      userProvidedAmountCents: 3_500, provenance: "user_reported_event" as const,
      occurredAt: "2026-10-26T12:00:00.000Z"
    }];
    const reply = await responder.respond({
      message: "Which event did I mention first?", recentTurns: [], memories: [], baselineReply: "The pending action is unchanged.",
      pendingAction: "savings_entry", conversationSavingsEvents: events
    });

    expect(reply).toBe("You first mentioned skipping the purchase.");
    expect(requestBody?.instructions).toContain("exact user and conversation");
    const providerInput = JSON.parse(String(requestBody?.input)) as { conversationSavingsEvents?: unknown };
    expect(providerInput.conversationSavingsEvents).toEqual(events);
  });

  it("answers a question while learning a user-stated preference", async () => {
    const memory = new MockMemoryProvider();
    const respond = vi.fn(async () => "Try a short walk or an easy meal tonight; a low-effort plan fits how tired you feel.");
    const evidence = "I work late shifts, so afternoon reminders are easier for me.";
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools(),
      conversationResponder: { respond },
      conversationalMemoryExtractor: { async extract() { return [{
        category: "preference", key: "reminder_time",
        value: "Prefers afternoon reminders because of late shifts.", evidence,
        confidence: 0.94, subject: "user", assertion: "affirmed", stability: "stable", sensitivity: "ordinary"
      }]; } }
    });
    const result = await agent.respond({ userId: "conversation_memory_user", message:
      `${evidence} This week I'm exhausted and struggling to cook. Any ideas?` });
    expect(result.message).toContain("easy meal");
    expect(result.message).not.toMatch(/I'll remember|keep that in mind/i);
    expect(respond).toHaveBeenCalledOnce();
    expect((await memory.listConversationalMemories("conversation_memory_user")).some((item) =>
      item.key === "reminder_time")).toBe(true);
  });

  it("lets an unrelated question pass a pending proposal without approving it", async () => {
    const tools = new MockVictoriaTools();
    const responder = vi.fn(async () => "For groceries, start with what you already have and plan two simple meals.");
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder }
    });
    const request = { userId: "pending_topic_user", conversationId: "pending_topic_chat" };
    await agent.respond({ ...request, message: "I skipped a $35 purchase instead of buying it." });
    const question = await agent.respond({ ...request, message: "Actually, what about groceries?" });
    expect(question.message).toContain("groceries");
    expect(question.decision.action).toBe("reflect");
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
    const topicSwitch = await agent.respond({ ...request, message: "Let's talk about groceries instead." });
    expect(topicSwitch.message).toContain("groceries");
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
    const statement = await agent.respond({ ...request, message: "Groceries are worrying me this week." });
    expect(statement.message).toContain("groceries");
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
    const approval = await agent.respond({ ...request, message: "Yes" });
    expect(approval.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(request.userId)).toHaveLength(1);
  });

  it("answers an unrelated question while a recorded-entry correction awaits approval", async () => {
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { async respond() { return "A simple grocery list can help you plan the week."; } }
    });
    const request = { userId: "pending_correction_topic_user", conversationId: "pending_correction_topic_chat" };
    await agent.respond({ ...request, message: "I almost bought a $27 pastry but decided to wait." });
    await agent.respond({ ...request, message: "Yes" });
    const correction = await agent.respond({ ...request, message: "Correct that recorded entry to $24." });
    expect(correction.decision.action).toBe("correct_ledger_entry");
    const answer = await agent.respond({ ...request, message: "What about groceries this week?" });
    expect(answer.message).toContain("grocery list");
    expect(await tools.listSavingsEntryCorrections(request.userId)).toEqual([]);
    const approved = await agent.respond({ ...request, message: "Yes" });
    expect(approved.decision.action).toBe("correct_ledger_entry");
    expect(await tools.listSavingsEntryCorrections(request.userId)).toHaveLength(1);
  });

  it("rejects generated money claims and unsupported amounts", () => {
    const input = { message: "What can I do?", recentTurns: [], memories: [], baselineReply: "Tell me more." };
    expect(validateConversationReply("I transferred your money.", input)).toBeNull();
    expect(validateConversationReply("You saved $500 today.", input)).toBeNull();
    expect(validateConversationReply("A simple meal could help tonight.", input)).toBe("A simple meal could help tonight.");
  });

  it("allows only user-sourced or explicitly stated event amounts in conversational replies", () => {
    const input = {
      message: "What did I skip?", recentTurns: [], baselineReply: "It was $40.",
      memories: [{ id: "memory-1", key: "spend", value: "$30", confidence: 0.95 }],
      conversationSavingsEvents: [{
        eventId: "event-1", type: "avoided_spend" as const, summary: "Skipped coffee", userProvidedAmountCents: 1200,
        provenance: "user_reported_event" as const, occurredAt: "2026-10-26T12:00:00.000Z"
      }]
    };
    expect(validateConversationReply("You skipped coffee, about $12.00.", input)).toBe("You skipped coffee, about $12.00.");
    expect(validateConversationReply("You skipped coffee, about $30.", input)).toBeNull();
    expect(validateConversationReply("You skipped coffee, about $40.", input)).toBeNull();
  });

  it.each(["I can send a bank transfer.", "I can wire the money.", "I can send it with Zelle.", "I can withdraw cash."])(
    "rejects conversational drafts that promise real movement: %s", (reply) => {
      const input = { message: "What can you do?", recentTurns: [], memories: [], baselineReply: "Tell me more." };
      expect(validateConversationReply(reply, input)).toBeNull();
    }
  );

  it("falls back safely when a conversation draft claims an action", async () => {
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { async respond() { return "I recorded $500 in your ledger."; } }
    });
    const response = await agent.respond({ userId: "invalid_draft_user", message: "What can I do with my evenings?" });
    expect(response.message).not.toContain("recorded $500");
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries("invalid_draft_user")).toEqual([]);
  });
});
