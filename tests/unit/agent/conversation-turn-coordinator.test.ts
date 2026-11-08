import { describe, expect, it } from "vitest";
import { buildConversationIntentPlan } from "../../../src/agent/conversation-intent-plan.js";
import { coordinateConversationTurn } from "../../../src/agent/conversation-turn-coordinator.js";
import type { AdvisoryTurnPlan } from "../../../src/agent/turn-understanding.js";

const readOnlyPlan: AdvisoryTurnPlan = {
  schemaVersion: 1,
  primaryIntent: "planning",
  secondaryIntents: ["dialogue"],
  dialogueActs: ["question"],
  questionFocus: "Should I put the freed amount toward debt repayment?",
  references: [],
  requestedReadOnlyTools: [],
  actionMention: "none",
  requestedAction: "none",
  uncertainty: { needsClarification: false, reasons: [] }
};

describe("coordinateConversationTurn", () => {
  it("keeps event recognition separate from a read-only advice response", () => {
    const message = "My employer covers the $35 gym now. Should I put the extra money into debt repayment?";
    const plan = coordinateConversationTurn({
      message,
      deterministicPlan: buildConversationIntentPlan({ message }),
      advisoryPlan: readOnlyPlan,
      financialClassificationType: "avoided_spend",
      hasPendingWorkflow: false,
      responderEnabled: true
    });

    expect(plan).toMatchObject({
      route: "read_only",
      responseFocus: "Should I put the extra money into debt repayment?",
      recognizedFinancialEvent: "avoided_spend",
      requestedAction: "none",
      pendingWorkflowDisposition: "none"
    });
  });

  it("keeps an avoided-spend statement on the financial workflow route", () => {
    const message = "I cooked instead of ordering takeout and avoided about $25.";
    const savingsMomentPlan: AdvisoryTurnPlan = {
      schemaVersion: readOnlyPlan.schemaVersion,
      primaryIntent: "savings_moment",
      secondaryIntents: [],
      dialogueActs: readOnlyPlan.dialogueActs,
      references: readOnlyPlan.references,
      requestedReadOnlyTools: readOnlyPlan.requestedReadOnlyTools,
      actionMention: readOnlyPlan.actionMention,
      requestedAction: readOnlyPlan.requestedAction,
      uncertainty: readOnlyPlan.uncertainty
    };
    const plan = coordinateConversationTurn({
      message,
      deterministicPlan: buildConversationIntentPlan({ message }),
      advisoryPlan: savingsMomentPlan,
      financialClassificationType: "avoided_spend",
      hasPendingWorkflow: false,
      responderEnabled: true
    });

    expect(plan.route).toBe("financial_workflow");
    expect(plan.recognizedFinancialEvent).toBe("avoided_spend");
  });

  it("keeps a mixed confirmation and question on the pending workflow route", () => {
    const message = "Yes, but what about the debt?";
    const plan = coordinateConversationTurn({
      message,
      deterministicPlan: buildConversationIntentPlan({ message, hasPendingWorkflow: true }),
      advisoryPlan: readOnlyPlan,
      financialClassificationType: "general_finance",
      hasPendingWorkflow: true,
      responderEnabled: true
    });

    expect(plan.route).toBe("pending_workflow");
    expect(plan.pendingWorkflowDisposition).toBe("referenced");
    expect(plan.requestedAction).toBe("none");
  });

  it("describes a requested pending-proposal revision without claiming it already happened", () => {
    const message = "Actually, change the amount to $20.";
    const plan = coordinateConversationTurn({
      message,
      deterministicPlan: buildConversationIntentPlan({ message, hasPendingWorkflow: true }),
      advisoryPlan: readOnlyPlan,
      financialClassificationType: "general_finance",
      hasPendingWorkflow: true,
      responderEnabled: true
    });

    expect(plan.pendingWorkflowDisposition).toBe("revision_requested");
    expect(plan.route).toBe("pending_workflow");
  });
});
