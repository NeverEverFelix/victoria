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
    expect(decision.reason).toBe("Real money movement requires explicit approval.");
  });

  it("allows real money movement when explicit approval is present", () => {
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

    expect(decision.allowed).toBe(true);
  });

  it("blocks approval-gated savings ledger entries without approval", () => {
    const decision = canCallTool(baseRequest(), {
      name: "createSavingsEntry",
      arguments: {},
      requiresApproval: true,
      movementMode: "mock_ledger"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Savings ledger entries require explicit approval.");
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
    expect(decision.reason).toBe("Real transfers require explicit approval.");
  });
});

function baseRequest(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    userId: "user_123",
    message: "I cooked instead of ordering takeout.",
    ...overrides
  };
}

