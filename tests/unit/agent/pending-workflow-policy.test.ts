import { describe, expect, it } from "vitest";
import { resolvePendingWorkflowMessage } from "../../../src/agent/pending-workflow-policy.js";

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
