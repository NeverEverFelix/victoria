import { describe, expect, it } from "vitest";
import { canCallTool, canUseMovementMode } from "../../../src/agent/policy.js";
import type { AgentRequest, ToolCallRequest } from "../../../src/agent/types.js";

describe("agent policy", () => {
  it("blocks real money movement without explicit approval", () => {
    const decision = canCallTool(baseRequest(), {
      name: "eventuallyMoveMoney",
      arguments: {},
      requiresApproval: true,
      movementMode: "real_transfer"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Real money movement is not available in the Victoria MVP.");
  });

  it("blocks real money movement during the MVP even when approval is present", () => {
    const decision = canCallTool(
      baseRequest({
        approvedActionId: "approval_123"
      }),
      {
        name: "eventuallyMoveMoney",
        arguments: {},
        requiresApproval: true,
        movementMode: "real_transfer"
      }
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Real money movement is not available in the Victoria MVP.");
  });

  it("blocks approval-gated savings ledger entries without approval", () => {
    const decision = canCallTool(baseRequest(), {
      name: "createSavingsEntry",
      actionId: "action_123",
      arguments: {},
      requiresApproval: true,
      movementMode: "mock_ledger"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Savings ledger entries require approval for this exact action.");
  });

  it("blocks savings goal allocations without approval for the exact action", () => {
    const decision = canCallTool(baseRequest(), {
      name: "createSavingsGoalAllocation",
      actionId: "goal_action_123",
      arguments: {},
      requiresApproval: false
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Savings goal allocations require approval for this exact action.");
  });

  it("allows a savings goal allocation only when approval matches its action", () => {
    const decision = canCallTool(baseRequest({ approvedActionId: "goal_action_123" }), {
      name: "createSavingsGoalAllocation",
      actionId: "goal_action_123",
      arguments: {},
      requiresApproval: true
    });

    expect(decision.allowed).toBe(true);
  });

  it("blocks approval for a different savings action", () => {
    const decision = canCallTool(
      baseRequest({ approvedActionId: "action_other" }),
      {
        name: "createSavingsEntry",
        actionId: "action_123",
        arguments: {},
        requiresApproval: true,
        movementMode: "mock_ledger"
      }
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Savings ledger entries require approval for this exact action.");
  });

  it("allows a savings entry only when approval matches the action", () => {
    const decision = canCallTool(
      baseRequest({ approvedActionId: "action_123" }),
      {
        name: "createSavingsEntry",
        actionId: "action_123",
        arguments: {},
        requiresApproval: true,
        movementMode: "mock_ledger"
      }
    );

    expect(decision.allowed).toBe(true);
  });

  it("allows non-money tools without approval", () => {
    const decision = canCallTool(baseRequest(), {
      name: "estimateAvoidedSpend",
      arguments: {},
      requiresApproval: false
    });

    expect(decision.allowed).toBe(true);
  });

  it("requires approval for real transfer movement mode", () => {
    const decision = canUseMovementMode(baseRequest(), "real_transfer");

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Real money movement is not available in the Victoria MVP.");
  });
});

function baseRequest(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    userId: "user_123",
    message: "I cooked instead of ordering takeout.",
    ...overrides
  };
}
