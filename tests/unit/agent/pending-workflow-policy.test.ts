import { describe, expect, it } from "vitest";
import {
  isPendingFinancialWorkflowExpired,
  PENDING_FINANCIAL_WORKFLOW_TTL_MS,
  resolvePendingWorkflowMessage
} from "../../../src/agent/pending-workflow-policy.js";

describe("resolvePendingWorkflowMessage", () => {
  it("keeps explicit approval and decline ahead of topic routing", () => {
    expect(resolvePendingWorkflowMessage({ message: "Yes", workflow: "goal_allocation" }))
      .toBe("explicit_approval");
    expect(resolvePendingWorkflowMessage({ message: "No", workflow: "entry_correction" }))
      .toBe("explicit_decline");
  });

  it("supersedes a pending correction before considering ambiguity or conversation", () => {
    expect(resolvePendingWorkflowMessage({
      message: "Can you correct that entry to $25 instead?",
      workflow: "entry_correction",
      expectedAmountCents: 2400
    })).toBe("replacement_request");
  });

  it("supersedes a goal retarget request and keeps unrelated topic switches read-only", () => {
    expect(resolvePendingWorkflowMessage({
      message: "Can you link this to my travel goal instead?",
      workflow: "goal_allocation",
      expectedAmountCents: 2700
    })).toBe("replacement_request");
    expect(resolvePendingWorkflowMessage({
      message: "Let's talk about my budget instead",
      workflow: "savings_entry",
      expectedAmountCents: 3500
    })).toBe("read_only_topic");
  });

  it("keeps ambiguous approvals and unsupported requests in the pending workflow", () => {
    expect(resolvePendingWorkflowMessage({ message: "Maybe", workflow: "savings_entry" }))
      .toBe("ambiguous");
    expect(resolvePendingWorkflowMessage({
      message: "I spent $12 on lunch.", workflow: "savings_entry", expectedAmountCents: 3500
    })).toBe("not_approval");
  });
});

describe("pending financial workflow expiry", () => {
  it("keeps an exact proposal active for 24 hours, then expires it", () => {
    const now = Date.parse("2026-10-29T12:00:00.000Z");
    const createdAt = new Date(now - PENDING_FINANCIAL_WORKFLOW_TTL_MS + 1).toISOString();
    expect(isPendingFinancialWorkflowExpired(createdAt, now)).toBe(false);
    expect(isPendingFinancialWorkflowExpired(new Date(now - PENDING_FINANCIAL_WORKFLOW_TTL_MS).toISOString(), now)).toBe(true);
  });

  it.each(["not-a-date", "2026-10-30T12:00:00.000Z"])(
    "fails closed for invalid or future proposal timestamps (%s)", (createdAt) => {
      expect(isPendingFinancialWorkflowExpired(createdAt, Date.parse("2026-10-29T12:00:00.000Z"))).toBe(true);
    }
  );
});
