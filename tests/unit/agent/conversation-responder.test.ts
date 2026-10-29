import { describe, expect, it, vi } from "vitest";
import { MockLlmAdapter, MockMemoryProvider, MockVictoriaTools, VictoriaAgent } from "../../../src/agent/index.js";
import { buildConversationContextSnapshot, OpenAiConversationResponder, validateConversationReply } from "../../../src/agent/conversation-responder.js";
import type { ConversationResponderInput } from "../../../src/agent/conversation-responder.js";

describe("conversation response boundary", () => {
  it("builds a frozen role-tagged dialogue from the transcript and current turn", () => {
    const snapshot = buildConversationContextSnapshot({
      message: "What should I try next?",
      recentTurns: ["User: I like short walks.", "Victoria: Would a walk after dinner fit?"],
      memories: []
    });

    expect(snapshot.dialogueTurns).toEqual([
      { role: "user", content: "I like short walks." },
      { role: "assistant", content: "Would a walk after dinner fit?" },
      { role: "user", content: "What should I try next?" }
    ]);
    expect(snapshot.scope).toEqual({ user: "authenticated_user", conversation: "current_conversation" });
    expect(Object.isFrozen(snapshot.scope)).toBe(true);
    expect(Object.isFrozen(snapshot.dialogueTurns)).toBe(true);
    expect(snapshot.dialogueTurns.every((turn) => Object.isFrozen(turn))).toBe(true);
  });

  it("tells the provider to adapt when the user pushes back on earlier advice", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const responder = new OpenAiConversationResponder({
      apiKey: "test-key", model: "test-model", fetcher: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ output: [{ type: "message", content: [{
          type: "output_text", text: JSON.stringify({ text: "That makes sense. We can choose a more flexible boundary." })
        }] }] }), { status: 200 });
      }
    });

    const reply = await responder.respond({
      message: "I'm not sure I can call it non-negotiable; my manager sometimes schedules Sunday requests. What's a realistic first boundary?",
      recentTurns: ["Victoria: Make Sunday time non-negotiable."], memories: [], baselineReply: "Tell me more."
    });

    expect(reply).toContain("more flexible boundary");
    expect(requestBody?.instructions).toContain("If the user corrects or pushes back on earlier advice");
    expect(requestBody?.instructions).toContain("concrete account and conversation identifiers are intentionally omitted");
    const providerInput = JSON.parse(String(requestBody?.input)) as { contextSnapshot: {
      scope: { user: string; conversation: string };
      dialogueTurns: Array<{ role: string; content: string }>;
    } };
    expect(providerInput.contextSnapshot.scope).toEqual({
      user: "authenticated_user", conversation: "current_conversation"
    });
    expect(providerInput.contextSnapshot.dialogueTurns).toContainEqual({
      role: "assistant", content: "Make Sunday time non-negotiable."
    });
  });

  it("deep-copies and freezes nested financial and event context", () => {
    const financialContext = {
      relevantUserTurns: [{ sourceTurnIndex: 0, text: "I skipped a $35 purchase." }],
      selectedMemoryFacts: [],
      financialFacts: [],
      conversationSavingsEvents: []
    };
    const events = [{
      eventId: "event-1", type: "avoided_spend" as const, summary: "Skipped a purchase.",
      userProvidedAmountCents: 3_500, provenance: "user_reported_event" as const,
      occurredAt: "2026-10-26T12:00:00.000Z"
    }];
    const snapshot = buildConversationContextSnapshot({
      message: "What happened?", recentTurns: [], memories: [],
      financialContext, conversationSavingsEvents: events
    });

    expect(snapshot.financialContext).not.toBe(financialContext);
    expect(snapshot.financialContext?.relevantUserTurns[0]).not.toBe(financialContext.relevantUserTurns[0]);
    expect(Object.isFrozen(snapshot.financialContext?.relevantUserTurns[0])).toBe(true);
    expect(snapshot.conversationSavingsEvents?.[0]).not.toBe(events[0]);
    expect(Object.isFrozen(snapshot.conversationSavingsEvents?.[0])).toBe(true);
    financialContext.relevantUserTurns[0]!.text = "changed after snapshot";
    events[0]!.summary = "changed after snapshot";
    expect(snapshot.financialContext?.relevantUserTurns[0]?.text).toBe("I skipped a $35 purchase.");
    expect(snapshot.conversationSavingsEvents?.[0]?.summary).toBe("Skipped a purchase.");
  });

  it("exposes resolved historical and active workflow references explicitly in the snapshot", () => {
    const financialContext = {
      relevantUserTurns: [], selectedMemoryFacts: [], financialFacts: [], conversationSavingsEvents: [],
      historicalEventReference: { kind: "resolved" as const, eventId: "event-1", matchedBy: "chronology" as const },
      workflowState: {
        status: "awaiting_confirmation" as const,
        actionId: "action-1", proposalId: "proposal-1", eventId: "event-1",
        pendingRecordableAmountCents: 3_500,
        integrity: "consistent" as const,
        currentMessageProposalReference: {
          actionId: "action-1", proposalId: "proposal-1", eventId: "event-1", matchedBy: "proposal_language" as const
        }
      }
    };
    const snapshot = buildConversationContextSnapshot({
      message: "Is that the event?", recentTurns: [], memories: [], financialContext
    });

    expect(snapshot.references).toEqual({
      historicalEvent: { kind: "resolved", eventId: "event-1", matchedBy: "chronology" },
      activeWorkflow: {
        actionId: "action-1", proposalId: "proposal-1", eventId: "event-1",
        currentMessageProposal: {
          actionId: "action-1", proposalId: "proposal-1", eventId: "event-1", matchedBy: "proposal_language"
        }
      }
    });
    expect(Object.isFrozen(snapshot.references)).toBe(true);
    expect(Object.isFrozen(snapshot.references?.activeWorkflow)).toBe(true);
    expect(Object.isFrozen(snapshot.references?.historicalEvent)).toBe(true);
  });

  it("preserves the identity of a pending non-savings workflow in the snapshot", () => {
    const snapshot = buildConversationContextSnapshot({
      message: "Can we talk about something else?", recentTurns: [], memories: [],
      pendingAction: "entry_correction",
      pendingWorkflowReference: { kind: "entry_correction", actionId: "correction-action-7" }
    });

    expect(snapshot.references?.pendingWorkflow).toEqual({
      kind: "entry_correction", actionId: "correction-action-7"
    });
    expect(Object.isFrozen(snapshot.references?.pendingWorkflow)).toBe(true);
  });

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
    expect(requestBody?.max_output_tokens).toBe(256);
    const providerInput = JSON.parse(String(requestBody?.input)) as { contextSnapshot: { conversationSavingsEvents?: unknown } };
    expect(providerInput.contextSnapshot.conversationSavingsEvents).toEqual(events);
  });

  it("passes provenance-aware financial facts into the read-only responder", async () => {
    let providerInput: Record<string, unknown> | undefined;
    const financialContext = {
      relevantUserTurns: [{ sourceTurnIndex: 0, text: "Work now covers my $35/month gym." }],
      financialFacts: [{
        id: "turn:0:annual-projection", amountCents: 42_000, currency: "USD" as const,
        period: "annual" as const, meaning: "conditional_projection" as const,
        provenance: "derived" as const, evidenceTurnIndexes: [0],
        derivedFromFactId: "turn:0:monthly-recurring-cost",
        condition: "Only if this monthly cost remains out of the budget for 12 months."
      }],
      selectedMemoryFacts: [],
      conversationSavingsEvents: []
    };
    const responder = new OpenAiConversationResponder({
      apiKey: "test-key", model: "test-model", fetcher: async (_input, init) => {
        providerInput = JSON.parse(String((JSON.parse(String(init?.body)) as { input: string }).input)) as Record<string, unknown>;
        return new Response(JSON.stringify({ output: [{ type: "message", content: [{
          type: "output_text", text: JSON.stringify({ text: "That could be $420 a year if the gym stays covered." })
        }] }] }), { status: 200 });
      }
    });
    const input = {
      message: "What would that be over a year?", recentTurns: ["User: Work now covers my $35/month gym."],
      memories: [], baselineReply: "The projection is conditional.", financialContext
    } satisfies ConversationResponderInput;

    expect(await responder.respond(input)).toContain("$420");
    expect(providerInput?.contextSnapshot).toMatchObject({ financialContext });
    expect(validateConversationReply("That could be $420 a year if the gym stays covered.", input)).not.toBeNull();
    expect(validateConversationReply("That is $420 a year.", input)).toBeNull();
    expect(validateConversationReply("You could save $500 a year if the gym stays covered.", input)).toBeNull();
  });

  it("accepts only conditionally framed projections grounded in a typed durable memory", () => {
    const input: ConversationResponderInput = {
      message: "What would basketball cost over a year?", recentTurns: [], memories: [], baselineReply: "I don't have enough detail.",
      financialContext: {
        relevantUserTurns: [], selectedMemoryFacts: [{
          id: "basketball-monthly-spend", category: "financial_pattern", key: "interest_spend:basketball",
          value: "Usually spends $35.00 per month on basketball.", evidence: "I usually spend $35 per month on basketball.",
          provenance: "user_statement"
        }],
        financialFacts: [{
          id: "memory:basketball-monthly-spend:annual-projection", amountCents: 42_000, currency: "USD",
          period: "annual", meaning: "conditional_projection", provenance: "derived", evidenceTurnIndexes: [],
          sourceMemoryId: "basketball-monthly-spend", condition: "Only if the monthly spend is avoided for all 12 months."
        }], conversationSavingsEvents: []
      }
    };

    expect(validateConversationReply("That would be $420 a year if the monthly spend continues for all 12 months.", input)).not.toBeNull();
    expect(validateConversationReply("That is $420 a year.", input)).toBeNull();
    expect(validateConversationReply("That is $4,200 a year if the monthly spend continues.", input)).toBeNull();
  });

  it("allows a more detailed read-only answer when the user explicitly asks for depth", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const responder = new OpenAiConversationResponder({
      apiKey: "test-key", model: "test-model", fetcher: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ output: [{ type: "message", content: [{
          type: "output_text", text: JSON.stringify({ text: "Here are a few options to consider." })
        }] }] }), { status: 200 });
      }
    });
    const input = {
      message: "Can you explain in detail how I could make evenings easier?",
      recentTurns: [], memories: [], baselineReply: "I can help think that through."
    };

    await responder.respond(input);

    const providerInput = JSON.parse(String(requestBody?.input)) as { contextSnapshot: { responseDepth?: string } };
    expect(providerInput.contextSnapshot.responseDepth).toBe("detailed");
    expect(requestBody?.instructions).toContain("enough detail to be actionable");
    expect(requestBody?.max_output_tokens).toBe(1_200);
  });

  it("uses a middle response budget for a multi-part question without an explicit request for detail", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const responder = new OpenAiConversationResponder({
      apiKey: "test-key", model: "test-model", fetcher: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ output: [{ type: "message", content: [{
          type: "output_text", text: JSON.stringify({ text: "Start with two easy weeknight meals, then adjust around the shifts that run late. A repeatable plan can still leave room for flexibility." })
        }] }] }), { status: 200 });
      }
    });
    const input = {
      message: "My work schedule changed and I'm trying to fit a lower-cost dinner routine around it. What should I consider for weeknights, and how can I keep it realistic?",
      recentTurns: [], memories: [], baselineReply: "We can think through a practical routine."
    };

    await responder.respond(input);

    const providerInput = JSON.parse(String(requestBody?.input)) as { contextSnapshot: { responseDepth?: string } };
    expect(providerInput.contextSnapshot.responseDepth).toBe("normal");
    expect(requestBody?.max_output_tokens).toBe(640);
    expect(validateConversationReply("A".repeat(2_000), input)).not.toBeNull();
  });

  it("uses a verified style preference for ordinary replies while honoring an explicit detail request", async () => {
    const depths: string[] = [];
    const responder = new OpenAiConversationResponder({
      apiKey: "test-key", model: "test-model", fetcher: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { input: string };
        depths.push((JSON.parse(body.input) as { contextSnapshot: { responseDepth: string } }).contextSnapshot.responseDepth);
        return new Response(JSON.stringify({ output: [{ type: "message", content: [{
          type: "output_text", text: JSON.stringify({ text: "A simple next step can make the evening feel more manageable." })
        }] }] }), { status: 200 });
      }
    });
    const common = { recentTurns: [], memories: [], baselineReply: "We can think through one next step." };

    await responder.respond({ ...common, message: "What might help tonight?", responsePreference: "detailed" });
    await responder.respond({ ...common, message: "Please explain in detail what might help tonight?", responsePreference: "brief" });

    expect(depths).toEqual(["normal", "detailed"]);
  });

  it("uses a larger validation budget only for an explicitly detailed request", () => {
    const detailed = {
      message: "Please explain in detail.", recentTurns: [], memories: [], baselineReply: "Tell me more."
    } satisfies ConversationResponderInput;
    const brief = { ...detailed, message: "What do you think?" };
    expect(validateConversationReply("A".repeat(2_000), detailed)).not.toBeNull();
    expect(validateConversationReply("A".repeat(2_000), brief)).toBeNull();
  });

  it("enforces the stated 450-character cap for an ordinary brief response", () => {
    const brief = {
      message: "What is one thing I can try?", recentTurns: [], memories: [], baselineReply: "Tell me more."
    } satisfies ConversationResponderInput;

    expect(validateConversationReply("A".repeat(450), brief)).not.toBeNull();
    expect(validateConversationReply("A".repeat(451), brief)).toBeNull();
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
    const responder = vi.fn(async (input: ConversationResponderInput) => {
      return `${input.message.toLowerCase().includes("groceries") ? "For groceries" : "For meal planning"}, start with what you already have and plan two simple meals.`;
    });
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder }
    });
    const request = { userId: "pending_topic_user", conversationId: "pending_topic_chat" };
    await agent.respond({ ...request, message: "I skipped a $35 purchase instead of buying it." });
    const question = await agent.respond({ ...request, message: "Actually, what about groceries?" });
    expect(question.message).toContain("groceries");
    expect(question.decision.action).toBe("reflect");
    const topicInput = responder.mock.calls.find(([input]) => input.message.includes("groceries"))?.[0];
    expect(topicInput?.financialContext).toMatchObject({
      financialFacts: [], selectedMemoryFacts: [], conversationSavingsEvents: []
    });
    expect(topicInput?.pendingAction).toBe("savings_entry");
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
    const fallback = vi.fn();
    const respond = vi.fn(async () => "I recorded $500 in your ledger.");
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond }, onConversationReplyFallback: fallback
    });
    const message = "What can I do with my evenings?";
    const response = await agent.respond({ userId: "invalid_draft_user", message });
    expect(response.message).toBe("I couldn't shape a thoughtful answer just now. For your evenings, are you hoping for more rest, more fun, or time to get something done?");
    expect(response.message).not.toContain("recorded $500");
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries("invalid_draft_user")).toEqual([]);
    expect(respond).toHaveBeenCalledTimes(2);
    expect(fallback).toHaveBeenCalledExactlyOnceWith("invalid_after_retry");
    expect(fallback.mock.calls.flat()).not.toContain(message);
  });

  it("reports provider failure without passing error or message content to telemetry", async () => {
    const fallback = vi.fn();
    const message = "What can I do with my evenings?";
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools: new MockVictoriaTools(),
      conversationResponder: { async respond() { throw new Error(`failed while answering ${message}`); } },
      onConversationReplyFallback: fallback
    });

    const response = await agent.respond({ userId: "provider_error_user", message });

    expect(response.message).toBe("I couldn't shape a thoughtful answer just now. For your evenings, are you hoping for more rest, more fun, or time to get something done?");
    expect(fallback).toHaveBeenCalledExactlyOnceWith("provider_error");
    expect(fallback.mock.calls.flat()).not.toContain(message);
  });

  it("retries an invalid detailed topic-shift draft while preserving a pending proposal", async () => {
    const tools = new MockVictoriaTools();
    const drafts = ["I recorded $19.95 for you."];
    const respond = vi.fn(async (input: ConversationResponderInput) =>
      input.baselineReply.includes("previous draft was not safe to show")
        ? "For a rainy weekend, you could try a new recipe, visit a museum, or plan a cozy movie afternoon."
        : drafts.shift() ?? "Tell me more about the weekend."
    );
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond }
    });
    const request = { userId: "pending_detailed_topic_user", conversationId: "pending_detailed_topic_chat" };
    await agent.respond({ ...request, message: "I almost bought a $19.95 book but decided to wait." });

    const topicShift = await agent.respond({ ...request,
      message: "Can you brainstorm a few practical things to do on a rainy weekend? Please give me options in detail." });

    expect(topicShift.message).toContain("museum");
    expect(topicShift.decision.action).toBe("reflect");
    expect(respond).toHaveBeenCalledTimes(2);
    expect(respond.mock.calls[1]?.[0].baselineReply).toContain("previous draft was not safe to show");
    expect(respond.mock.calls[1]?.[0].contextSnapshot).toBe(respond.mock.calls[0]?.[0].contextSnapshot);
    expect(respond.mock.calls[1]?.[0].contextSnapshot).not.toHaveProperty("baselineReply");
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);

    const approval = await agent.respond({ ...request, message: "Yes" });
    expect(approval.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(request.userId)).toMatchObject([{ amountCents: 1_995 }]);
  });

  it("keeps the deterministic pending-action baseline when both conversational drafts are invalid", async () => {
    const tools = new MockVictoriaTools();
    const respond = vi.fn(async () => "I recorded $500 in your ledger.");
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond }
    });
    const request = { userId: "pending_invalid_fallback_user", conversationId: "pending_invalid_fallback_chat" };
    await agent.respond({ ...request, message: "I almost bought a $19.95 book but decided to wait." });

    const topicShift = await agent.respond({ ...request, message: "Let's talk about groceries instead." });

    expect(topicShift.message).toMatch(/savings suggestion remains pending and has not been recorded/i);
    expect(topicShift.message).not.toContain("$500");
    expect(respond).toHaveBeenCalledTimes(2);
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
    const approval = await agent.respond({ ...request, message: "Yes" });
    expect(approval.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(request.userId)).toHaveLength(1);
  });

  it("routes an explicit budget topic switch past a pending savings action without treating it as approval or revision", async () => {
    const tools = new MockVictoriaTools();
    const responder = vi.fn(async () => "We can talk through what matters in your budget first; the pending suggestion can wait.");
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder }
    });
    const request = { userId: "pending_budget_topic_user", conversationId: "pending_budget_topic_chat" };
    await agent.respond({ ...request, message: "I almost bought a $35 jacket but decided to wait." });

    const topicShift = await agent.respond({ ...request, message: "Let's talk about my budget instead." });

    expect(topicShift.message).toContain("budget first");
    expect(topicShift.decision.action).toBe("reflect");
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
    const approval = await agent.respond({ ...request, message: "Yes" });
    expect(approval.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(request.userId)).toMatchObject([{ amountCents: 3_500 }]);
  });
});
