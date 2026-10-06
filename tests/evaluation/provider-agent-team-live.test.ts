import { loadEnvConfig } from "@next/env";
import { describe, expect, it } from "vitest";
import { MockVictoriaTools } from "../../src/agent/tools/mock-tools.js";
import { createVictoriaAgent } from "../../src/app/create-victoria-agent.js";
import { parseVictoriaEnv } from "../../src/config/env.js";

const runLiveSmoke = process.env.RUN_PROVIDER_AGENT_TEAM_SMOKE === "1";
if (runLiveSmoke) loadEnvConfig(process.cwd());

describe.skipIf(!runLiveSmoke)("live provider agent-team smoke", () => {
  it("runs one avoided-spend turn with the provider team and mock ledger", async () => {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey || /^(?:local-|test-|replace|placeholder)/i.test(apiKey)) {
      throw new Error("Set a real OPENAI_API_KEY in ignored .env.local or the process environment.");
    }
    if (process.env.APP_ENV !== "local") throw new Error("This smoke command only runs with APP_ENV=local.");

    const env = parseVictoriaEnv({ ...process.env, NODE_ENV: "development" });
    if (!env.openAiAgentTeamEnabled) throw new Error("Set OPENAI_AGENT_TEAM_ENABLED=true for the smoke run.");
    if (env.openAiModel === "mock") throw new Error("Set OPENAI_MODEL to a provider model for the smoke run.");
    if (env.moneyMovementMode !== "mock_ledger") throw new Error("The smoke run requires MONEY_MOVEMENT_MODE=mock_ledger.");

    const providerRoles: string[] = [];
    const tools = new MockVictoriaTools();
    const agent = createVictoriaAgent({
      env,
      tools,
      fetcher: async (input, init) => {
        try {
          const body = JSON.parse(String(init?.body)) as { text?: { format?: { name?: string } } };
          providerRoles.push(body.text?.format?.name ?? "unknown");
        } catch {
          providerRoles.push("unknown");
        }
        return fetch(input, init);
      }
    });

    const userId = "local_provider_smoke_user";
    const response = await agent.respond({
      userId,
      conversationId: "local_provider_smoke",
      message: "I almost bought a $19.95 book but decided to wait."
    });
    const entries = await tools.listSavingsEntries(userId);

    expect(response.decision.action).not.toBe("create_ledger_entry");
    expect(entries).toEqual([]);
    if (response.decision.action === "suggest_savings") {
      expect(response.decision.toolCall?.requiresApproval).toBe(true);
      expect(response.message).toContain("No real money has moved");
    }
    expect(providerRoles[0]).toBe("financial_moment_v1");

    process.stdout.write(`${JSON.stringify({
      model: env.openAiModel,
      providerRoles,
      classification: response.decision.classification.type,
      action: response.decision.action,
      suggestedAmountCents: response.decision.suggestion?.amountCents ?? null,
      message: response.message,
      ledgerEntryCount: entries.length
    }, null, 2)}\n`);
  }, 45_000);
});
