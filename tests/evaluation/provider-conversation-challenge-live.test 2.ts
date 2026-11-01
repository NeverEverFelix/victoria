import { describe, expect, it } from "vitest";
import nextEnv from "@next/env";
import { OpenAiConversationResponder } from "../../src/agent/conversation-responder.js";
import { MockVictoriaTools } from "../../src/agent/tools/mock-tools.js";
import { createVictoriaAgent } from "../../src/app/create-victoria-agent.js";
import { parseVictoriaEnv } from "../../src/config/env.js";

const enabled = process.env.RUN_PROVIDER_CONVERSATION_CHALLENGE === "1";
if (enabled && (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true")) {
  throw new Error("The live conversation challenge is local-only and cannot run in CI.");
}
if (enabled && process.env.CONFIRM_LIVE_CONVERSATION_CHALLENGE !== "1") {
  throw new Error("Set CONFIRM_LIVE_CONVERSATION_CHALLENGE=1 to confirm provider requests and possible API charges.");
}

describe.skipIf(!enabled)("live provider conversation challenge", () => {
  it("handles a topic shift, ambiguous approval, scoped history, then exact approval", async () => {
    const priorNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    nextEnv.loadEnvConfig(process.cwd(), true, undefined, true);
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorNodeEnv;
    const key = process.env.OPENAI_API_KEY?.trim() ?? "";
    if (!key || /^(?:local-|test-|replace|placeholder)/i.test(key)) {
      throw new Error("Set a real provider key in ignored .env.local or the process environment.");
    }
    if (process.env.APP_ENV !== "local") throw new Error("This challenge only runs with APP_ENV=local.");
    const env = parseVictoriaEnv({ ...process.env, NODE_ENV: "development" });
    if (env.openAiModel === "mock" || env.moneyMovementMode !== "mock_ledger") {
      throw new Error("Use a real provider model with MONEY_MOVEMENT_MODE=mock_ledger.");
    }

    const providerCalls: Array<{ format: string; input?: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body)) as { text?: { format?: { name?: string } }; input?: string };
      providerCalls.push({
        format: body.text?.format?.name ?? "unknown",
        ...(body.input === undefined ? {} : { input: body.input })
      });
      return fetch(input, init);
    };
    const tools = new MockVictoriaTools();
    const userId = "live_conversation_challenge_user";
    const conversationId = `live_conversation_challenge_${Date.now()}`;
    const agent = createVictoriaAgent({
      env: { ...env, openAiAgentTeamEnabled: true },
      tools,
      fetcher,
      conversationResponder: new OpenAiConversationResponder({ apiKey: key, model: env.openAiModel, fetcher })
    });
    const send = (message: string) => agent.respond({ userId, conversationId, message });

    const proposal = await send("I almost bought a $19.95 book but decided to wait.");
    expect(proposal.decision.action).toBe("suggest_savings");
    expect(proposal.decision.suggestion?.amountCents).toBe(1_995);
    expect(await tools.listSavingsEntries(userId)).toEqual([]);

    const topicShift = await send("Can you brainstorm a few practical things to do on a rainy weekend? Please give me options in detail.");
    expect(topicShift.message).toMatch(/(?:rain|weekend|indoors|book|movie|museum|cook|walk|activity)/i);
    expect(topicShift.decision.action).not.toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(userId)).toEqual([]);

    const ambiguousApproval = await send("Sure, I guess. Whatever you think.");
    expect(ambiguousApproval.decision.action).not.toBe("create_ledger_entry");
    expect(ambiguousApproval.message).toMatch(/(?:clear yes|clear confirmation|confirm|yes or no)/i);
    expect(await tools.listSavingsEntries(userId)).toEqual([]);

    const history = await send("What financial moment did I mention first in this conversation?");
    expect(history.message).toMatch(/(?:book|almost bought|wait|purchase)/i);
    expect(history.decision.action).not.toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(userId)).toEqual([]);

    const approved = await send("Yes");
    expect(approved.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(userId)).toMatchObject([{ amountCents: 1_995 }]);

    const detailedRequest = providerCalls.find((call) => call.format === "conversation_reply_v1" &&
      call.input?.includes("rainy weekend"));
    expect(detailedRequest?.input).toContain('"responseDepth":"detailed"');
    process.stdout.write(`${JSON.stringify({
      model: env.openAiModel,
      providerCallCount: providerCalls.length,
      providerRoles: providerCalls.map((call) => call.format),
      turns: [proposal, topicShift, ambiguousApproval, history, approved].map(({ message, decision }) => ({
        message, action: decision.action, amountCents: decision.suggestion?.amountCents ?? null
      })),
      finalLedgerEntryCount: (await tools.listSavingsEntries(userId)).length,
      finalLedgerAmountCents: (await tools.listSavingsEntries(userId))[0]?.amountCents ?? null
    }, null, 2)}\n`);
  }, 180_000);
});
