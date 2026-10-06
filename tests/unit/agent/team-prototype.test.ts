import { describe, expect, it, vi } from "vitest";
import { AgentTeamPrototype, type AgentTeamSpecialists, type SavingsAssessment } from "../../../src/agent/team-prototype.js";
import type { AgentMemory, ClassifiedMessage } from "../../../src/agent/types.js";

const memory: AgentMemory = { habits: [], goals: [], recentDecisions: [] };
const avoided: ClassifiedMessage = {
  type: "avoided_spend", confidence: 0.9, amountCents: 9000,
  summary: "Waited on a jacket", needsClarification: false
};

describe("AgentTeamPrototype", () => {
  it("routes structured advice through the three specialists in order", async () => {
    const order: string[] = [];
    const specialists: AgentTeamSpecialists = {
      financialMoment: { analyze: vi.fn(async () => { order.push("moment"); return { classification: avoided }; }) },
      savingsReasoning: { assess: vi.fn(async ({ finding }: { finding: { classification: ClassifiedMessage } }) => {
        order.push("savings");
        expect(finding.classification).toEqual(avoided);
        return { outcome: "suggest" as const, confidence: 0.95, amountCents: 9000, source: "user_provided" as const, rationale: "User stated the amount." };
      }) },
      companionVoice: { respond: vi.fn(async ({ assessment }) => {
        order.push("voice");
        expect(assessment.outcome).toBe("suggest");
        return "Want me to record $90 in your Victoria ledger? No real money has moved.";
      }) }
    };

    const turn = await new AgentTeamPrototype(specialists).respond({ message: "I waited on a $90 jacket", memory });
    expect(order).toEqual(["moment", "savings", "voice"]);
    expect(turn.assessment).toMatchObject({ outcome: "suggest", amountCents: 9000 });
    expect(turn.message).toContain("No real money has moved");
    expect(specialists.financialMoment.analyze).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed moment output before routing to savings reasoning", async () => {
    const specialists = team({ classification: { ...avoided, type: "nonsense" } as unknown as ClassifiedMessage });
    const turn = await new AgentTeamPrototype(specialists).respond({ message: "anything", memory });
    expect(turn.assessment.outcome).toBe("ask");
    expect(turn.degradedRoles).toContain("financialMoment");
    expect(specialists.savingsReasoning.assess).not.toHaveBeenCalled();
  });

  it("rejects money actions disguised as savings advice", async () => {
    const specialists = team({ assessment: { outcome: "suggest", amountCents: 9000, source: "user_provided", rationale: "ok", toolCall: { name: "createSavingsEntry" } } as never });
    const turn = await new AgentTeamPrototype(specialists).respond({ message: "anything", memory });
    expect(turn.assessment.outcome).toBe("ask");
    expect(turn.degradedRoles).toContain("savingsReasoning");
    expect(turn.message).toContain("Could you clarify");
  });

  it("keeps savings reasoning bound to the amount the user stated", async () => {
    const specialists = team({ assessment: {
      outcome: "suggest", confidence: 0.95, amountCents: 12000, source: "habit_estimate", rationale: "Typical price."
    } });
    const turn = await new AgentTeamPrototype(specialists).respond({ message: "I waited on a $90 jacket", memory });
    expect(turn.assessment).toMatchObject({ outcome: "ask" });
    expect(turn.degradedRoles).toContain("savingsReasoning");
    expect(turn.message).not.toContain("$120");
  });

  it("[ARC-005] downgrades a low-confidence savings suggestion to clarification", async () => {
    const specialists = team({ assessment: {
      outcome: "suggest", confidence: 0.55, amountCents: 9000,
      source: "user_provided", rationale: "Low confidence despite matching amount."
    } });
    const turn = await new AgentTeamPrototype(specialists).respond({ message: "I waited on a $90 jacket", memory });

    expect(turn.assessment.outcome).toBe("ask");
    expect(turn.message).toContain("Could you clarify");
    expect(turn.degradedRoles).toContain("savingsReasoning");
  });

  it("restores required disclosures when companion voice omits them", async () => {
    const specialists = team({ voiceMessage: "That sounds like a thoughtful pause." });
    const turn = await new AgentTeamPrototype(specialists).respond({ message: "I waited on a $90 jacket", memory });
    expect(turn.message).toContain("Would you like me to record $90.00");
    expect(turn.message).toContain("Please confirm before I record it.");
    expect(turn.message).toContain("No real money has moved.");
    expect(specialists.companionVoice.respond).toHaveBeenCalledWith(expect.objectContaining({
      requiredDisclosures: ["Ask for explicit confirmation before recording.", "No real money has moved."]
    }));
  });

  it("uses the savings specialist's clarification without asking voice to rewrite it", async () => {
    const specialists = team({
      assessment: { outcome: "ask", confidence: 0.4, question: "Which amount should I use" },
      voiceMessage: "Sure, sounds good."
    });
    const turn = await new AgentTeamPrototype(specialists).respond({ message: "I waited on a jacket", memory });

    expect(turn.message).toBe("Which amount should I use");
    expect(turn.degradedRoles).toEqual([]);
    expect(specialists.companionVoice.respond).not.toHaveBeenCalled();
  });

  it("replaces companion wording that falsely claims a completed action", async () => {
    const specialists = team({ voiceMessage: "I recorded the $90 in your savings already." });
    const turn = await new AgentTeamPrototype(specialists).respond({ message: "I waited on a $90 jacket", memory });
    expect(turn.message).toContain("Would you like me to record $90.00");
    expect(turn.message).not.toContain("I recorded");
    expect(turn.degradedRoles).toContain("companionVoice");
  });

  it("replaces companion wording that promises real money movement", async () => {
    const specialists = team({ voiceMessage: "I can transfer that $90 to your savings account right away." });
    const turn = await new AgentTeamPrototype(specialists).respond({ message: "I waited on a $90 jacket", memory });
    expect(turn.message).toContain("Would you like me to record $90.00");
    expect(turn.message).toContain("No real money has moved");
    expect(turn.message).not.toContain("transfer that");
    expect(turn.degradedRoles).toContain("companionVoice");
  });

  it("replaces shaming companion wording for regretful spending", async () => {
    const specialists = team({
      classification: {
        type: "regretful_spend", confidence: 0.9, summary: "Regretted takeout", needsClarification: false
      },
      assessment: { outcome: "reflect", confidence: 0.95, rationale: "Offer a calm reflection." },
      voiceMessage: "That was irresponsible, and you should have known better."
    });
    const turn = await new AgentTeamPrototype(specialists).respond({ message: "I regret ordering takeout.", memory });
    expect(turn.message).toContain("No shame");
    expect(turn.message).not.toContain("irresponsible");
    expect(turn.degradedRoles).toContain("companionVoice");
  });

  it("replaces companion wording that introduces an unsupported amount", async () => {
    const specialists = team({
      voiceMessage: "You avoided a $90 purchase, so you can record $120 today."
    });
    const turn = await new AgentTeamPrototype(specialists).respond({ message: "I waited on a $90 jacket", memory });
    expect(turn.message).toContain("$90.00");
    expect(turn.message).not.toContain("$120");
    expect(turn.degradedRoles).toContain("companionVoice");
  });

  it("preserves estimate wording for habit-based amounts", async () => {
    const withoutAmount = { ...avoided };
    delete withoutAmount.amountCents;
    withoutAmount.merchantName = "Blue Bottle";
    const estimateMemory: AgentMemory = {
      ...memory,
      habits: [{
        id: "habit_blue_bottle", userId: "user_123", merchantName: "Blue Bottle",
        typicalAmountCents: 2400, currency: "USD", confidence: 0.9
      }]
    };
    const specialists = team({
      classification: withoutAmount,
      assessment: { outcome: "suggest", confidence: 0.95, amountCents: 2400, source: "habit_estimate", rationale: "Usual merchant spend." },
      voiceMessage: "Would you like me to record this?"
    });
    const turn = await new AgentTeamPrototype(specialists).respond({ message: "I made coffee at home", memory: estimateMemory });
    expect(turn.message).toContain("estimate");
    expect(turn.message).toContain("$24.00");
    expect(turn.message).toContain("Please confirm before I record it.");
  });

  it("rejects a user-provided amount that was not present in the financial finding", async () => {
    const withoutAmount = { ...avoided };
    delete withoutAmount.amountCents;
    const specialists = team({ classification: withoutAmount });
    const turn = await new AgentTeamPrototype(specialists).respond({ message: "I almost bought something", memory });
    expect(turn.assessment.outcome).toBe("ask");
    expect(turn.message).not.toContain("$90.00");
    expect(turn.degradedRoles).toContain("savingsReasoning");
  });

  it("fails closed when a financial specialist throws and skips later work when classification fails", async () => {
    const specialists = team();
    specialists.financialMoment.analyze = vi.fn().mockRejectedValue(new Error("provider down"));
    const turn = await new AgentTeamPrototype(specialists).respond({ message: "I saved money", memory });
    expect(turn.finding.classification.type).toBe("unclear");
    expect(turn.assessment.outcome).toBe("ask");
    expect(turn.specialistCalls).toBe(1);
    expect(turn.degradedRoles).toContain("financialMoment");
    expect(specialists.savingsReasoning.assess).not.toHaveBeenCalled();
    expect(specialists.companionVoice.respond).not.toHaveBeenCalled();
  });

  it("uses a clarification after savings reasoning fails and a safe response after voice fails", async () => {
    const savingsFailure = team();
    savingsFailure.savingsReasoning.assess = vi.fn().mockRejectedValue(new Error("provider down"));
    const asked = await new AgentTeamPrototype(savingsFailure).respond({ message: "I waited on a $90 jacket", memory });
    expect(asked.assessment.outcome).toBe("ask");
    expect(asked.message).toContain("make sure I have the amount right");
    expect(asked.specialistCalls).toBe(2);
    expect(savingsFailure.companionVoice.respond).not.toHaveBeenCalled();

    const voiceFailure = team();
    voiceFailure.companionVoice.respond = vi.fn().mockRejectedValue(new Error("provider down"));
    const recovered = await new AgentTeamPrototype(voiceFailure).respond({ message: "I waited on a $90 jacket", memory });
    expect(recovered.message).toContain("Please confirm before I record it.");
    expect(recovered.message).toContain("No real money has moved.");
    expect(recovered.degradedRoles).toContain("companionVoice");
  });

  it("reports bounded specialist calls and per-role latency without treating a single turn as a percentile", async () => {
    let now = 0;
    const specialists = team();
    const turn = await new AgentTeamPrototype(specialists, { nowMs: () => now += 10 })
      .respond({ message: "I waited on a $90 jacket", memory });
    expect(turn.specialistCalls).toBe(3);
    expect(turn.specialistTimings.map(({ role }) => role)).toEqual(["financialMoment", "savingsReasoning", "companionVoice"]);
    expect(turn.specialistTimings.every(({ durationMs }) => durationMs === 10)).toBe(true);
    expect(turn.totalDurationMs).toBeGreaterThan(1);
    expect(turn.status).toBe("complete");
  });

  it("preserves MVP transfer limitations in companion wording", async () => {
    const specialists = team({
      classification: { type: "real_money_movement_request", confidence: 1, summary: "Move money", needsClarification: false },
      assessment: { outcome: "reflect", confidence: 0.95, rationale: "Transfer unavailable." },
      voiceMessage: "I can help with that."
    });
    const turn = await new AgentTeamPrototype(specialists).respond({ message: "Move money to savings", memory });
    expect(turn.message).toContain("I can't move real money in the Victoria MVP.");
    expect(turn.message).toContain("No transfer has been made.");
    expect(specialists.companionVoice.respond).toHaveBeenCalledWith(expect.objectContaining({
      requiredDisclosures: ["Victoria cannot move real money in the MVP.", "No transfer has been made."]
    }));
  });

  it("accepts safe disclosures that mention transfer without claiming a transfer", async () => {
    const specialists = team({
      voiceMessage: "You do not need to transfer anything; would you like me to record $90? No real money has moved."
    });
    const turn = await new AgentTeamPrototype(specialists).respond({ message: "I waited on a $90 jacket", memory });

    expect(turn.message).toContain("You do not need to transfer anything");
    expect(turn.message).toContain("No real money has moved.");
  });
});

function team(overrides: {
  classification?: ClassifiedMessage;
  assessment?: SavingsAssessment;
  voiceMessage?: string;
} = {}): AgentTeamSpecialists {
  return {
    financialMoment: { analyze: vi.fn(async () => ({ classification: overrides.classification ?? avoided })) },
    savingsReasoning: { assess: vi.fn(async (): Promise<SavingsAssessment> => overrides.assessment ?? { outcome: "suggest", confidence: 0.95, amountCents: 9000, source: "user_provided", rationale: "User stated the amount." }) },
    companionVoice: { respond: vi.fn(async ({ assessment }: { assessment: SavingsAssessment }) => overrides.voiceMessage ?? (
      assessment.outcome === "suggest"
        ? "Want me to record this? No real money has moved."
        : assessment.outcome === "ask"
          ? assessment.question
          : "No shame. We can reflect and plan for next time."
    )) }
  };
}
